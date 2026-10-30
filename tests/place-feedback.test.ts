import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../server/db';
import {createApi} from '../server/app';
import {createPlaceFeedbackMailQueue} from '../server/placeFeedbackMail';
import {lookupMapPlace} from '../server/maps';

async function fixture(){
  const db=openDatabase(':memory:');
  const app=createApi({db,feedbackMail:{apiKey:'',to:'',from:''},mapFetch:async()=>new Response('{"elements":[]}')});
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as any).port}/api`;
  const call=async(path:string,body?:unknown,cookie='')=>{
    const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});
    return {status:response.status,body:await response.json() as any,cookie:response.headers.get('set-cookie')?.split(';')[0]||''};
  };
  const admin=await call('/auth/register',{displayName:'Admin',email:'feedback-admin@example.test',password:'test-password-long'});
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(admin.body.user.id);
  const created=await call('/admin/places',{name:'Posto <img src=x onerror=alert(1)>',kind:'fuel',lat:-23.55,lng:-46.63,address:'Rua conferida'},admin.cookie);
  assert.equal(created.status,201,JSON.stringify(created.body));
  return {db,call,app,admin,place:created.body,close:async()=>{app.locals.feedbackMail.close();await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}};
}
const answers={notExists:false,incorrectName:true,incorrectKind:false,rating:4};
test('place feedback records all answers, keeps one rating per account, and enters the admin queue without editing the place',async()=>{
  const f=await fixture();try{
    const path=`/places/${encodeURIComponent(f.place.id)}/feedback`;
    assert.deepEqual((await f.call(path)).body,{average:null,count:0,myRating:null});
    assert.equal((await f.call(path,answers)).status,401);
    assert.equal((await f.call(path,{...answers,notExists:'false'},f.admin.cookie)).status,400);
    assert.equal((await f.call(path,{...answers,rating:6},f.admin.cookie)).status,400);
    assert.equal((await f.call(path,{...answers,incorrectKind:null},f.admin.cookie)).status,400);
    assert.equal((await f.call('/places/fake/feedback',answers,f.admin.cookie)).status,404);
    const submissionId=randomUUID();
    const first=await f.call(path,{...answers,submissionId,to:'attacker@example.test'},f.admin.cookie);
    assert.equal(first.status,201);assert.equal(first.body.average,4);assert.equal(first.body.count,1);
    assert.equal((await f.call(path,{...answers,submissionId},f.admin.cookie)).status,200,'network retries are idempotent');
    assert.equal((await f.call(path,{...answers,rating:1,submissionId},f.admin.cookie)).status,409);
    assert.equal((f.db.prepare('SELECT COUNT(*) AS n FROM place_feedback_mail').get() as any).n,1);
    const reports=await f.call('/admin/reports',undefined,f.admin.cookie);
    assert.equal(reports.body.items.length,1);assert.equal(reports.body.items[0].targetType,'places');
    assert.equal(reports.body.items[0].placeName,f.place.name);assert.match(reports.body.items[0].details,/Nome incorreto\? Sim/);
    assert.match(reports.body.items[0].details,/não existe\? Não/);
    assert.match(reports.body.items[0].details,/incorreto\? Não/);
    const second=await f.call(path,{...answers,rating:5},f.admin.cookie);
    assert.equal(second.body.average,5);assert.equal(second.body.count,1,'editing a rating does not create another voter');
    const unchanged=(await f.call(`/places/${encodeURIComponent(f.place.id)}`)).body;
    assert.equal(unchanged.name,f.place.name);assert.equal(unchanged.kind,'fuel');assert.equal(unchanged.active,true);
    assert.equal((await f.call('/admin/feedback-email')).status,401);
    const delivery=(await f.call('/admin/feedback-email',undefined,f.admin.cookie)).body;
    assert.equal(delivery.configured,false);assert.equal(delivery.pending,2);
    assert.equal((await f.call('/admin/review/places/'+encodeURIComponent(f.place.id),{action:'reject'},f.admin.cookie)).status,400);
    f.db.prepare('UPDATE users SET blocked_at=? WHERE id=?').run(new Date().toISOString(),f.admin.body.user.id);
    assert.deepEqual((await f.call(path)).body,{average:null,count:0,myRating:null},'blocked accounts do not affect public stars');
  }finally{await f.close();}
});
test('email persists through missing configuration and failures, retries the same submission without client-controlled recipients',async()=>{
  const f=await fixture();try{
    const path=`/places/${encodeURIComponent(f.place.id)}/feedback`;
    await f.call(path,{...answers,submissionId:randomUUID(),to:'attacker@example.test'},f.admin.cookie);
    let now=Date.now()+1000,fail=true;const requests:{headers:Headers;body:any}[]=[];
    const fetcher:typeof fetch=async(_url,options)=>{
      requests.push({headers:new Headers(options?.headers),body:JSON.parse(String(options?.body))});
      return fail?new Response('secret provider response',{status:503}):Response.json({id:'provider-message'});
    };
    const mail=createPlaceFeedbackMailQueue(f.db,{apiKey:'test-only',from:'reports@verified.example.test',to:'owner@example.test',fetcher,now:()=>now});
    await Promise.all([mail.flush(),mail.flush()]);assert.equal(requests.length,1,'concurrent flushes must not double-send');
    assert.deepEqual(requests[0].body.to,['owner@example.test']);assert.equal(requests[0].body.html,undefined,'user text stays plain text');
    assert.match(requests[0].body.text,/Nome incorreto\? Sim/);assert.match(requests[0].body.text,/4 de 5/);
    let record=f.db.prepare('SELECT * FROM place_feedback_mail').get() as any;
    assert.equal(record.sent_at,null);assert.equal(record.last_error,'provider_503');
    await mail.flush();assert.equal(requests.length,1,'retry respects backoff');mail.close();
    now+=61_000;fail=false;
    const restarted=createPlaceFeedbackMailQueue(f.db,{apiKey:'test-only',from:'reports@verified.example.test',to:'owner@example.test',fetcher,now:()=>now});
    await restarted.flush();assert.equal(requests.length,2);assert.equal(requests[0].headers.get('Idempotency-Key'),requests[1].headers.get('Idempotency-Key'));
    record=f.db.prepare('SELECT * FROM place_feedback_mail').get() as any;assert.ok(record.sent_at);assert.equal(record.last_error,'');
    await restarted.flush();assert.equal(requests.length,2);restarted.close();
  }finally{await f.close();}
});
test('rating-only submissions update stars and remain out of the unresolved problem queue',async()=>{
  const f=await fixture();try{
    const path=`/places/${encodeURIComponent(f.place.id)}/feedback`;
    const result=await f.call(path,{notExists:false,incorrectName:false,incorrectKind:false,rating:3},f.admin.cookie);
    assert.equal(result.status,201);assert.equal(result.body.average,3);
    assert.equal((await f.call('/admin/reports',undefined,f.admin.cookie)).body.items.length,0);
    const other=await f.call('/auth/register',{displayName:'Outro',email:'feedback-other@example.test',password:'test-password-long'});
    assert.equal((await f.call('/admin/feedback-email',undefined,other.cookie)).status,403);
    await f.call(path,{...answers,rating:5},other.cookie);
    const publicView=(await f.call(path)).body;assert.equal(publicView.average,4);assert.equal(publicView.count,2);assert.equal(publicView.myRating,null);
    assert.equal((await f.call(path,undefined,other.cookie)).body.myRating,5);
  }finally{await f.close();}
});
test('OSM squares keep their category instead of falling back to park or a generic point',async()=>{
  const place=await lookupMapPlace('node/32',async()=>Response.json({elements:[{id:32,type:'node',lat:-23,lng:-46,lon:-46,tags:{place:'square',name:'Praça de teste'}}]}));
  assert.equal(place.kind,'square');
});
