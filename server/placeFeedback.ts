import type {Express} from 'express';
import {createHash,randomUUID} from 'node:crypto';
import type {FuelDatabase} from './db';
import {ApiError,auth,administrator,user,now} from './http';
import {PLACE_FEEDBACK_QUESTIONS,type PlaceFeedbackDraft} from '../src/types/placeFeedback';
import {PLACE_KINDS} from '../src/types/admin';
import type {PlaceFeedbackMailQueue} from './placeFeedbackMail';

export function registerPlaceFeedbackRoutes(app:Express,db:FuelDatabase,
  limit:(key:string,max:number,ms:number)=>void,mail:PlaceFeedbackMailQueue){
  const place=(id:string)=>{
    const row=db.prepare('SELECT id,name,kind,address,lat,lng,source_url FROM stations WHERE id=? AND active=1').get(id) as
      {id:string;name:string;kind:string;address:string;lat:number;lng:number;source_url:string}|undefined;
    if(!row)throw new ApiError('Estabelecimento não encontrado.',404);return row;
  };
  const summary=(id:string,viewer?:string)=>{
    const result=db.prepare(`SELECT AVG(r.rating) AS average,COUNT(*) AS count FROM place_ratings r
      JOIN users u ON u.id=r.user_id WHERE r.place_id=? AND u.blocked_at IS NULL AND u.deleted_at IS NULL`).get(id) as {average:number|null;count:number};
    const mine=viewer?db.prepare('SELECT rating FROM place_ratings WHERE place_id=? AND user_id=?').get(id,viewer) as {rating:number}|undefined:undefined;
    return {...result,myRating:mine?.rating??null};
  };
  app.get('/api/places/:id/feedback',(req,res)=>{place(req.params.id);res.json(summary(req.params.id,user(res)?.id));});
  app.post('/api/places/:id/feedback',auth,(req,res)=>{
    const target=place(req.params.id),actor=user(res).id;
    const draft=req.body as PlaceFeedbackDraft & {submissionId?:string};
    if(!draft||!PLACE_FEEDBACK_QUESTIONS.every(q=>typeof draft[q.key]==='boolean'))
      throw new ApiError('Responda Sim ou Não às três perguntas.');
    if(draft.rating!==undefined&&(!Number.isInteger(draft.rating)||draft.rating<1||draft.rating>5))
      throw new ApiError('Escolha uma avaliação de 1 a 5 estrelas.');
    if(draft.submissionId!==undefined&&(typeof draft.submissionId!=='string'||!/^[a-f0-9-]{36}$/i.test(draft.submissionId)))
      throw new ApiError('Identificação do envio inválida.');
    const id=draft.submissionId??randomUUID();
    const hash=createHash('sha256').update(JSON.stringify([target.id,actor,...PLACE_FEEDBACK_QUESTIONS.map(q=>draft[q.key]),draft.rating??null])).digest('hex');
    const prior=db.prepare('SELECT user_id,request_hash FROM place_feedback_mail WHERE id=?').get(id) as {user_id:string;request_hash:string}|undefined;
    if(prior){
      if(prior.user_id!==actor||prior.request_hash!==hash)throw new ApiError('Este envio já foi utilizado. Abra o formulário novamente.',409);
      res.json({message:'Respostas enviadas.',...summary(target.id,actor)});return;
    }
    limit(`place-feedback:${actor}`,5,3600_000);
    const details=PLACE_FEEDBACK_QUESTIONS.map(q=>`${q.label} ${draft[q.key]?'Sim':'Não'}`).join('\n');
    const stamp=now(),hasIssue=PLACE_FEEDBACK_QUESTIONS.some(q=>draft[q.key]);
    const kind=PLACE_KINDS.find(k=>k.id===target.kind)?.label||'Estabelecimento';
    const body=[`Estabelecimento: ${target.name}`,`Tipo: ${kind}`,`Endereço: ${target.address||'Não informado'}`,
      `Localização: ${target.lat}, ${target.lng}`,`Mapa: ${target.source_url}`,`ID: ${target.id}`,'',
      ...(draft.rating?[`Avaliação: ${draft.rating} de 5 estrelas`]:[]),details,'',
      `Enviado em: ${stamp}`,'As respostas ficam disponíveis para revisão no painel administrativo.'].join('\n');
    db.exec('BEGIN IMMEDIATE');
    try{
      if(draft.rating!==undefined)db.prepare(`INSERT INTO place_ratings(place_id,user_id,rating,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(place_id,user_id) DO UPDATE SET rating=excluded.rating,updated_at=excluded.updated_at`).run(target.id,actor,draft.rating,stamp);
      db.prepare(`INSERT INTO reports(id,target_type,target_id,user_id,reason,details,status,created_at) VALUES(?,'places',?,?,'dados_estabelecimento',?,?,?)
        ON CONFLICT(target_type,target_id,user_id) DO UPDATE SET details=excluded.details,status=excluded.status,created_at=excluded.created_at`)
        .run(randomUUID(),target.id,actor,`${draft.rating?`Avaliação: ${draft.rating}/5\n`:''}${details}`,hasIssue?'open':'resolved',stamp);
      const report=db.prepare("SELECT id FROM reports WHERE target_type='places' AND target_id=? AND user_id=?").get(target.id,actor) as {id:string};
      db.prepare(`INSERT INTO place_feedback_mail(id,report_id,user_id,request_hash,subject,body,created_at,next_attempt_at) VALUES(?,?,?,?,?,?,?,?)`)
        .run(id,report.id,actor,hash,`Rolê: avaliação e relato — ${target.name.replace(/[\r\n]/g,' ').slice(0,150)}`,body,stamp,stamp);
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    void mail.flush().catch(()=>{});
    res.status(201).json({message:'Respostas enviadas.',...summary(target.id,actor)});
  });
  app.get('/api/admin/feedback-email',auth,administrator,(_req,res)=>res.json(mail.status()));
}
