import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db';
import { createApi } from '../server/app';
import { distanceToRouteKm } from '../server/roadAlerts';
import { upcomingRoadAlert } from '../src/services/roadAlertDistance';

const route: [number, number][] = [[-23.5,-46.6],[-23.5,-46.59],[-23.5,-46.58]];
test('distance to road uses full segments, not only point markers', () => {
  assert.ok(distanceToRouteKm([-23.5, -46.595],route) < 0.01);
  assert.ok(distanceToRouteKm([-23.51, -46.595],route) > 1);
});
test('active alert appears only ahead, expires and ignores other roads', () => {
  const base = { kind: 'pothole' as const, createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(), note:'', id:'a',lat:-23.5,lng:-46.585 };
  assert.ok(upcomingRoadAlert([base],route,[-23.5,-46.597],0,2)?.distanceKm);
  assert.equal(upcomingRoadAlert([base],route,[-23.5,-46.581],1.9,2),null);
  assert.equal(upcomingRoadAlert([{...base,lat:-23.52}],route,[-23.5,-46.597],0,2),null);
  assert.equal(upcomingRoadAlert([{...base,expiresAt:new Date(Date.now()-1000).toISOString()}],route,[-23.5,-46.597],0,2),null);
});
test('road hazards require signed-in sender and admin approval; public route reveals no contributor', async () => {
  const db = openDatabase(':memory:');
  const server = createApi({db}).listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as any).port}/api`;
  const call=async (method:string,path:string,body?:unknown,cookie='')=>{
    const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});
    return {status:r.status,data:await r.json() as any,cookie:r.headers.get('set-cookie')?.split(';')[0]||''};
  };
  try{
    const traveler=await call('POST','/auth/register',{email:'traveler-alert@test.example',displayName:'Relator',password:'strong-secret-123'});
    const admin=await call('POST','/auth/register',{email:'admin-alert@test.example',displayName:'Moderador',password:'strong-secret-123'});
    db.prepare("UPDATE users SET role='admin' WHERE id=?").run(admin.data.user.id);
    const event={kind:'pothole',coords:[-23.5,-46.595],note:'Buraco na direita',accuracyMeters:5,locationTimestamp:Date.now()};
    const anonymous = await call('POST','/road-alerts',event);
    assert.equal(anonymous.status,201,'Relatar uma ocorrência não deve exigir login');
    assert.equal(anonymous.data.status,'pending','Relato anônimo passa por moderação');
    assert.equal((await call('POST','/road-alerts',{...event,accuracyMeters:100})).status,400);
    assert.equal((await call('POST','/road-alerts',{...event,accuracyMeters:100},traveler.cookie)).status,400);
    assert.equal((await call('POST','/road-alerts',{...event,locationTimestamp:Date.now()-70000},traveler.cookie)).status,400);
    const created=await call('POST','/road-alerts',event,traveler.cookie);
    assert.equal(created.status,201);
    assert.equal(created.data.status,'pending');
    const before=await call('POST','/road-alerts/route',{routePath:route});
    assert.deepEqual(before.data.alerts,[]);
    assert.equal((await call('GET','/admin/road-alerts')).status,401);
    assert.equal((await call('GET','/admin/road-alerts',undefined,traveler.cookie)).status,403);
    const queue=await call('GET','/admin/road-alerts',undefined,admin.cookie);
    assert.equal(queue.data.total,1);
    assert.equal(queue.data.items[0].submittedBy,'Relator');
    assert.equal((await call('POST',`/admin/road-alerts/${created.data.id}/review`,{action:'approve'},traveler.cookie)).status,403);
    assert.equal((await call('POST',`/admin/road-alerts/${created.data.id}/review`,{action:'approve'},admin.cookie)).status,200);
    const visible=await call('POST','/road-alerts/route',{routePath:route});
    assert.equal(visible.data.alerts.length,1);
    assert.equal(visible.data.alerts[0].note,event.note);
    assert.equal('submittedBy' in visible.data.alerts[0],false);
    assert.equal('status' in visible.data.alerts[0],false);
    assert.deepEqual((await call('POST','/road-alerts/route',{routePath:[[0,0],[0,0.01]]})).data.alerts,[]);
    assert.equal((await call('POST',`/admin/road-alerts/${created.data.id}/review`,{action:'reject'},admin.cookie)).status,409);
    const revoked = await call('POST',`/admin/road-alerts/${created.data.id}/review`,{action:'revoke'},admin.cookie);
    assert.equal(revoked.status,200);
    assert.equal(revoked.data.status,'rejected');
    assert.equal((await call('POST','/road-alerts/route',{routePath:route})).data.alerts.length,0);
    assert.equal((await call('POST',`/admin/road-alerts/${created.data.id}/review`,{action:'revoke'},admin.cookie)).status,409);
    db.prepare("UPDATE road_alerts SET expires_at=? WHERE id=?").run(new Date(Date.now()-60000).toISOString(),created.data.id);
    assert.equal((await call('POST','/road-alerts/route',{routePath:route})).data.alerts.length,0);
    const mine=await call('GET','/road-alerts/mine',undefined,traveler.cookie);
    assert.equal(mine.data.alerts[0].status,'expired');
    assert.equal((db.prepare("SELECT count(*) AS total FROM moderation_actions WHERE target_type='road_alerts'").get() as any).total,2);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}
});
test('stopped vehicle alert expires quickly and rejected reports never appear',async()=>{
  const db=openDatabase(':memory:');
  const server=createApi({db}).listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as any).port}/api`;
  try {
    const response=await fetch(base+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'driver-alert@test.example',displayName:'Motorista',password:'strong-secret-123'})});
    const cookie=response.headers.get('set-cookie')?.split(';')[0]||'';
    const post=await fetch(base+'/road-alerts',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({kind:'broken_vehicle',coords:route[1],locationTimestamp:Date.now(),accuracyMeters:4})});
    assert.equal(post.status,201);
    const {id}=await post.json() as any;
    const row=db.prepare('SELECT expires_at FROM road_alerts WHERE id=?').get(id) as any;
    assert.ok(Date.parse(row.expires_at)-Date.now() <= 2*3600000);
    assert.ok(Date.parse(row.expires_at)-Date.now() >= 2*3600000-10000);
    const alerts=await fetch(base+'/road-alerts/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({routePath:route})});
    assert.deepEqual((await alerts.json() as any).alerts,[]);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}
});


test('new hazard categories and nearby community checks require three independent reports', async () => {
  const db = openDatabase(':memory:');
  const server = createApi({db}).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const call = async (method: string, path: string, body?: unknown, cookie = '') => {
    const response = await fetch(base + path, {
      method, headers: {'Content-Type':'application/json', Cookie:cookie},
      body: body ? JSON.stringify(body) : undefined
    });
    return {status:response.status, data:await response.json() as any,
      cookie:response.headers.get('set-cookie')?.split(';')[0] || ''};
  };
  try {
    const owner = await call('POST','/auth/register',{email:'alerts-owner@test.example',displayName:'Autor',password:'strong-secret-123'});
    const admin = await call('POST','/auth/register',{email:'alerts-admin@test.example',displayName:'Admin',password:'strong-secret-123'});
    db.prepare("UPDATE users SET role='admin' WHERE id=?").run(admin.data.user.id);
    const sample = {coords:route[1], accuracyMeters:6, locationTimestamp:Date.now()};
    const ids: string[] = [];
    for (const kind of ['flooded_road','police_presence','robbery']) {
      const created = await call('POST','/road-alerts',{...sample,kind},owner.cookie);
      assert.equal(created.status,201);
      ids.push(created.data.id);
      assert.equal((await call('POST',`/admin/road-alerts/${created.data.id}/review`,{action:'approve'},admin.cookie)).status,200);
    }
    assert.deepEqual((await call('POST','/road-alerts/route',{routePath:route})).data.alerts.map((a:any)=>a.kind).sort(),
      ['flooded_road','police_presence','robbery']);
    const voters = [];
    for (let i=0;i<3;i++) {
      voters.push(await call('POST','/auth/register',{email:`alerts-voter-${i}@test.example`,displayName:'Colaborador',password:'strong-secret-123'}));
    }
    const endpoint = `/road-alerts/${ids[0]}/confirm`;
    assert.equal((await call('POST',endpoint,{...sample,present:false})).status,401);
    assert.equal((await call('POST',endpoint,{...sample,present:false},owner.cookie)).status,403);
    assert.equal((await call('POST',endpoint,{...sample,present:false,coords:[0,0]},voters[0].cookie)).status,400);
    assert.equal((await call('POST',endpoint,{...sample,present:false,accuracyMeters:200},voters[0].cookie)).status,400);
    assert.equal((await call('POST',endpoint,{...sample,present:false},voters[0].cookie)).status,200);
    assert.equal((await call('POST',endpoint,{...sample,present:false},voters[0].cookie)).status,409);
    const second = await call('POST',endpoint,{...sample,present:false},voters[1].cookie);
    assert.equal(second.status,200);
    assert.equal(second.data.removed,false);
    const third = await call('POST',endpoint,{...sample,present:false},voters[2].cookie);
    assert.equal(third.status,200);
    assert.equal(third.data.removed,true);
    assert.equal((await call('POST','/road-alerts/route',{routePath:route})).data.alerts.length,2);
    assert.equal((await call('POST',endpoint,{...sample,present:true},admin.cookie)).status,409);
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); db.close(); }
});
