import type { Express, Response } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import type { FuelDatabase } from './db';
import { ApiError, auth, user, now } from './http';
import { validateCoordinates } from './maps';
export function registerConvoyRoutes(app:Express,db:FuelDatabase,limit:(key:string,max:number,ms:number)=>void){
  db.exec(`CREATE TABLE IF NOT EXISTS convoys(id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,organizer_id TEXT NOT NULL REFERENCES users(id),snapshot TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS convoy_members(convoy_id TEXT NOT NULL REFERENCES convoys(id),user_id TEXT NOT NULL REFERENCES users(id),vehicle_type TEXT NOT NULL,vehicle_nickname TEXT NOT NULL DEFAULT '',sharing INTEGER NOT NULL DEFAULT 0,lat REAL,lng REAL,location_at TEXT,joined_at TEXT NOT NULL,PRIMARY KEY(convoy_id,user_id));
    CREATE INDEX IF NOT EXISTS convoy_members_user ON convoy_members(user_id);`);
  for(const [table,column,definition] of [['convoys','revision','INTEGER NOT NULL DEFAULT 0'],['convoys','route_revision','INTEGER NOT NULL DEFAULT 0'],['convoy_members','location_token','TEXT']]){
    if(!(db.prepare(`PRAGMA table_info(${table})`).all() as any[]).some(c=>c.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  const member=(id:string,res:Response)=>{const row=db.prepare('SELECT c.* FROM convoys c JOIN convoy_members m ON m.convoy_id=c.id WHERE c.id=? AND m.user_id=?').get(id,user(res).id) as any;if(!row)throw new ApiError('Comboio não encontrado ou você não participa dele.',404);return row;};
  const active=(row:any)=>{if(row.status!=='active')throw new ApiError('Este comboio foi encerrado.',409);};
  const organizer=(row:any,res:Response)=>{if(row.organizer_id!==user(res).id)throw new ApiError('Somente o organizador pode fazer esta alteração.',403);};
  const bump=(id:string,route=false)=>{db.prepare(`UPDATE convoys SET revision=revision+1,route_revision=route_revision+?,updated_at=? WHERE id=?`).run(Number(route),now(),id);return db.prepare('SELECT * FROM convoys WHERE id=?').get(id) as any;};
  const view=(row:any,res:Response)=>{
    db.prepare('UPDATE convoy_members SET lat=NULL,lng=NULL WHERE convoy_id=? AND location_at<?').run(row.id,new Date(Date.now()-180000).toISOString());
    const members=db.prepare('SELECT m.*,u.display_name,u.blocked_at,u.deleted_at FROM convoy_members m JOIN users u ON u.id=m.user_id WHERE convoy_id=? ORDER BY joined_at,user_id').all(row.id) as any[];
    const own=members.find(m=>m.user_id===user(res).id);
    const participants=members.filter(m=>!m.blocked_at&&!m.deleted_at).map(m=>{
      const stale=!m.location_at||Date.now()-new Date(m.location_at).getTime()>180000;
      const sharing=row.status==='active'&&!!m.sharing;
      return {id:m.user_id,name:m.display_name,vehicleType:m.vehicle_type,vehicleNickname:m.vehicle_nickname,isOrganizer:m.user_id===row.organizer_id,isSharingLocation:sharing,
        coords:sharing&&!stale&&m.lat!=null?[m.lat,m.lng]:undefined,lastLocationTimestamp:sharing?m.location_at||undefined:undefined,isStale:sharing&&stale,joinedAt:m.joined_at};
    });
    return {...JSON.parse(row.snapshot),id:row.id,code:row.code,organizerId:row.organizer_id,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,revision:row.revision,routeRevision:row.route_revision,
      ownLocationToken:row.status==='active'&&own?.sharing?own.location_token||undefined:undefined,participants};
  };
  const vehicle=(body:any)=>{if(!['car','motorcycle'].includes(body?.vehicleType))throw new ApiError('Informe o tipo de veículo.');return {type:body.vehicleType,nickname:String(body.vehicleNickname||'').slice(0,100)};};
  const points=(value:any)=>{
    if(!Array.isArray(value)||value.length>20)throw new ApiError('Use até 20 pontos de encontro.');
    return value.map((p,i)=>{
      if(typeof p?.title!=='string'||!p.title.trim()||p.title.length>150||!['posto','restaurante','mirante','estacionamento','entrada_cidade','minha_escolha'].includes(p.category))throw new ApiError('Ponto de encontro inválido.');
      validateCoordinates([p.coords]);
      return {id:randomUUID(),title:p.title.trim(),category:p.category,coords:p.coords,description:String(p.description||'').slice(0,1000),order:i+1,confirmedArrivedParticipantIds:[],
        ...Object.fromEntries(['cep','street','number','neighborhood','city'].map(k=>[k,String(p[k]||'').slice(0,200)]))};
    });
  };
  const tripData=(trip:any)=>{
    if(!trip||typeof trip.title!=='string'||trip.title.length>400||typeof trip.originName!=='string'||trip.originName.length>500||typeof trip.destinationName!=='string'||trip.destinationName.length>500||!Array.isArray(trip.routePath)||trip.routePath.length<2||trip.routePath.length>2500)throw new ApiError('Roteiro do comboio inválido.');
    trip.routePath.forEach((p:unknown)=>validateCoordinates([p]));
    return {tripId:String(trip.id||'').slice(0,120),tripTitle:trip.title,originName:trip.originName,destinationName:trip.destinationName,routePath:trip.routePath};
  };
  const expectRoute=(row:any,req:any)=>{if(!Number.isSafeInteger(req.body.routeRevision)||req.body.routeRevision!==row.route_revision)throw new ApiError('O roteiro foi alterado em outro aparelho. Atualize o comboio antes de tentar novamente.',409);};
  const mutate=(row:any,snapshot:any,route=false)=>{db.prepare('UPDATE convoys SET snapshot=? WHERE id=?').run(JSON.stringify(snapshot),row.id);return bump(row.id,route);};
  app.get('/api/convoys',auth,(_req,res)=>res.json({convoys:(db.prepare("SELECT c.* FROM convoys c JOIN convoy_members m ON m.convoy_id=c.id WHERE m.user_id=? AND c.status='active' ORDER BY c.created_at DESC LIMIT 30").all(user(res).id) as any[]).map(row=>view(row,res))}));
  app.post('/api/convoys',auth,(req,res)=>{
    limit(`convoy-create:${user(res).id}`,10,3600000);
    if((db.prepare("SELECT COUNT(*) AS count FROM convoys WHERE organizer_id=? AND status='active'").get(user(res).id) as any).count>=10)throw new ApiError('Encerre um comboio antes de criar outro.',409);
    const trip=tripData(req.body.trip),v=vehicle(req.body.organizerUser),id=randomUUID(),code='ROTA-'+randomBytes(5).toString('hex').toUpperCase();
    const snapshot={title:String(req.body.title||trip.tripTitle).slice(0,300),...trip,meetingPoints:points(req.body.meetingPoints||[]),notes:String(req.body.notes||'').slice(0,2000)};
    db.exec('BEGIN IMMEDIATE');try{
      db.prepare('INSERT INTO convoys(id,code,organizer_id,snapshot,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,code,user(res).id,JSON.stringify(snapshot),'active',now(),now());
      db.prepare('INSERT INTO convoy_members(convoy_id,user_id,vehicle_type,vehicle_nickname,joined_at) VALUES(?,?,?,?,?)').run(id,user(res).id,v.type,v.nickname,now());db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    res.status(201).json(view(member(id,res),res));
  });
  app.post('/api/convoys/join',auth,(req,res)=>{
    limit(`convoy-join:${user(res).id}:${req.ip}`,10,60000);const code=String(req.body.code||'').trim().toUpperCase();
    const row=db.prepare("SELECT * FROM convoys WHERE code=? AND status='active'").get(code) as any;if(!row)throw new ApiError('Código inválido ou comboio encerrado.',404);
    const v=vehicle(req.body);
    if((db.prepare('SELECT COUNT(*) AS count FROM convoy_members WHERE convoy_id=?').get(row.id) as any).count>=100&&!db.prepare('SELECT 1 FROM convoy_members WHERE convoy_id=? AND user_id=?').get(row.id,user(res).id))throw new ApiError('Comboio lotado.',409);
    const result=db.prepare('INSERT OR IGNORE INTO convoy_members(convoy_id,user_id,vehicle_type,vehicle_nickname,joined_at) VALUES(?,?,?,?,?)').run(row.id,user(res).id,v.type,v.nickname,now());
    res.json(view(result.changes?bump(row.id):row,res));
  });
  app.get('/api/convoys/:id',auth,(req,res)=>res.json(view(member(String(req.params.id),res),res)));
  app.put('/api/convoys/:id/location',auth,(req,res)=>{
    const row=member(String(req.params.id),res);active(row);limit(`convoy-location:${user(res).id}`,40,60000);
    if(typeof req.body.enabled!=='boolean')throw new ApiError('Informe seu consentimento para compartilhar localização.');
    const own=db.prepare('SELECT * FROM convoy_members WHERE convoy_id=? AND user_id=?').get(row.id,user(res).id) as any;
    let lat=null,lng=null,timestamp=null,token:string|null=null;
    if(req.body.enabled&&req.body.coords){
      if(!own.sharing||own.location_token&&own.location_token!==req.body.locationToken)throw new ApiError('O compartilhamento foi interrompido ou passou para outro aparelho.',409);
      [lat,lng]=validateCoordinates([req.body.coords])[0];const age=Date.now()-new Date(req.body.timestamp).getTime();
      if(!Number.isFinite(age)||age< -5000||age>60000||!Number.isFinite(req.body.accuracyMeters)||req.body.accuracyMeters<0||req.body.accuracyMeters>50)throw new ApiError('A posição deve vir de GPS recente e preciso.');
      timestamp=new Date(req.body.timestamp).toISOString();token=own.location_token;
      if(own.location_at&&timestamp<=own.location_at){res.json(view(row,res));return;}
    }else if(req.body.enabled){
      if(req.body.deviceId!=null&&(typeof req.body.deviceId!=='string'||!req.body.deviceId.length||req.body.deviceId.length>120))throw new ApiError('Aparelho inválido.');
      token=req.body.deviceId?randomUUID():null;
      if(own.location_token&&!req.body.deviceId)throw new ApiError('Atualize o aplicativo para assumir o compartilhamento neste aparelho.',409);
    }else{
      if(own.sharing&&own.location_token&&own.location_token!==req.body.locationToken)throw new ApiError('O compartilhamento pertence a outro aparelho.',409);
      if(!own.sharing){res.json(view(row,res));return;}
    }
    db.prepare('UPDATE convoy_members SET sharing=?,lat=?,lng=?,location_at=?,location_token=? WHERE convoy_id=? AND user_id=?').run(Number(req.body.enabled),lat,lng,timestamp,token,row.id,user(res).id);
    res.json(view(bump(row.id),res));
  });
  app.post('/api/convoys/:id/check-in',auth,(req,res)=>{
    const row=member(String(req.params.id),res);active(row);const snapshot=JSON.parse(row.snapshot),point=snapshot.meetingPoints.find((p:any)=>p.id===req.body.meetingPointId);
    if(!point)throw new ApiError('Ponto não encontrado.',404);const owner=user(res).id,ids=point.confirmedArrivedParticipantIds as string[],was=ids.includes(owner);
    if(req.body.arrived!=null&&typeof req.body.arrived!=='boolean')throw new ApiError('Confirmação inválida.');
    const arrived=req.body.arrived??!was;point.confirmedArrivedParticipantIds=arrived?[...new Set([...ids,owner])]:ids.filter(id=>id!==owner);
    res.json(view(mutate(row,snapshot),res));
  });
  app.post('/api/convoys/:id/meeting-points',auth,(req,res)=>{
    const row=member(String(req.params.id),res);active(row);organizer(row,res);const snapshot=JSON.parse(row.snapshot);
    if(snapshot.meetingPoints.length>=20)throw new ApiError('Limite de pontos de encontro atingido.');
    snapshot.meetingPoints.push({...points([req.body])[0],order:snapshot.meetingPoints.length+1});res.json(view(mutate(row,snapshot,true),res));
  });
  app.patch('/api/convoys/:id/route',auth,(req,res)=>{
    const row=member(String(req.params.id),res);active(row);organizer(row,res);expectRoute(row,req);
    const snapshot={...JSON.parse(row.snapshot),...tripData(req.body.trip)};res.json(view(mutate(row,snapshot,true),res));
  });
  app.delete('/api/convoys/:id/meeting-points/:pointId',auth,(req,res)=>{
    const row=member(String(req.params.id),res);active(row);organizer(row,res);expectRoute(row,req);const snapshot=JSON.parse(row.snapshot);
    if(!snapshot.meetingPoints.some((p:any)=>p.id===req.params.pointId))throw new ApiError('Ponto não encontrado.',404);
    snapshot.meetingPoints=snapshot.meetingPoints.filter((p:any)=>p.id!==req.params.pointId).map((p:any,i:number)=>({...p,order:i+1}));res.json(view(mutate(row,snapshot,true),res));
  });
  app.post('/api/convoys/:id/leave',auth,(req,res)=>{
    const row=member(String(req.params.id),res);if(row.organizer_id===user(res).id&&row.status==='active')throw new ApiError('O organizador deve encerrar o comboio antes de sair.',409);
    db.prepare('DELETE FROM convoy_members WHERE convoy_id=? AND user_id=?').run(row.id,user(res).id);const snapshot=JSON.parse(row.snapshot);
    snapshot.meetingPoints.forEach((p:any)=>{p.confirmedArrivedParticipantIds=p.confirmedArrivedParticipantIds.filter((id:string)=>id!==user(res).id);});mutate(row,snapshot);res.json({ok:true});
  });
  app.post('/api/convoys/:id/end',auth,(req,res)=>{
    const row=member(String(req.params.id),res);organizer(row,res);db.exec('BEGIN IMMEDIATE');try{
      db.prepare("UPDATE convoys SET status='completed',updated_at=?,revision=revision+1 WHERE id=?").run(now(),row.id);
      db.prepare('UPDATE convoy_members SET sharing=0,lat=NULL,lng=NULL,location_at=NULL,location_token=NULL WHERE convoy_id=?').run(row.id);db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}res.json({ok:true});
  });
}
