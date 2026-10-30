import type {FuelDatabase} from './db';

export interface PlaceFeedbackMailOptions {apiKey?:string;from?:string;to?:string;fetcher?:typeof fetch;now?:()=>number}
const email=(value:string)=>value.length<=180&&/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
export function createPlaceFeedbackMailQueue(db:FuelDatabase,options:PlaceFeedbackMailOptions={}){
  const apiKey=options.apiKey??process.env.RESEND_API_KEY;
  const from=options.from??process.env.RDV_FEEDBACK_EMAIL_FROM??'';
  const to=options.to??process.env.RDV_FEEDBACK_EMAIL_TO??'';
  const fetcher=options.fetcher??fetch,clock=options.now??Date.now;
  const configured=Boolean(apiKey&&email(from)&&email(to));
  let running:Promise<void>|null=null,closed=false;
  const deliverPending=async()=>{
    if(!configured||closed)return;
    const due=db.prepare(`SELECT id,subject,body,attempts FROM place_feedback_mail
      WHERE sent_at IS NULL AND next_attempt_at<=? ORDER BY created_at LIMIT 10`).all(new Date(clock()).toISOString()) as {id:string;subject:string;body:string;attempts:number}[];
    for(const item of due){
      if(closed)return;
      try{
        const response=await fetcher('https://api.resend.com/emails',{method:'POST',
          headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`place-feedback/${item.id}`},
          body:JSON.stringify({from,to:[to],subject:item.subject,text:item.body}),signal:AbortSignal.timeout(8000),redirect:'error'});
        if(!response.ok)throw new Error(`provider_${response.status}`);
        const result=await response.json() as {id?:unknown};
        if(typeof result.id!=='string'||!result.id)throw new Error('provider_invalid_response');
        if(!closed)db.prepare("UPDATE place_feedback_mail SET sent_at=?,attempts=attempts+1,last_error='' WHERE id=?")
          .run(new Date(clock()).toISOString(),item.id);
      }catch(error){
        // Provider bodies may contain secrets or mailbox details. Persist only a
        // bounded status code; keep the report and retry it with the same key.
        const message=error instanceof Error&&/^provider_(\d{3}|invalid_response)$/.test(error.message)?error.message:'provider_unavailable';
        const delay=Math.min(6*3600_000,60_000*2**Math.min(item.attempts,9));
        if(!closed)db.prepare('UPDATE place_feedback_mail SET attempts=attempts+1,next_attempt_at=?,last_error=? WHERE id=?')
          .run(new Date(clock()+delay).toISOString(),message,item.id);
      }
    }
  };
  return {
    flush(){if(!running)running=deliverPending().finally(()=>{running=null;});return running;},
    status(){return {configured,recipient:to||null,
      pending:(db.prepare('SELECT COUNT(*) AS count FROM place_feedback_mail WHERE sent_at IS NULL').get() as {count:number}).count};},
    close(){closed=true;}
  };
}
export type PlaceFeedbackMailQueue=ReturnType<typeof createPlaceFeedbackMailQueue>;
