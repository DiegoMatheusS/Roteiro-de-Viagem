import {createHash} from 'node:crypto';
import type {Express} from 'express';
import type {FuelDatabase} from './db';
import {ApiError,auth,clientIp,now,user,validate} from './http';
import {validateCoordinates} from './maps';
import {addressDto,publicAddressMatches} from './addressIndex';
import {addressMatches,addressQueryTokens,addressSearchText,matchingPostcode,normalizePostcode,parseAddressParts,requestedPostcode} from '../src/services/addressDetails';
import {matchingHouseNumber,rankLocationSuggestions,requestedHouseNumber} from '../src/services/locationSuggestions';
import {isStreetAddressQuery,streetQueryForManualPin} from '../src/services/manualAddressPin';
import type {LocationSelection} from '../src/types/itinerary';
import type {AddressParts} from '../src/types/address';

function history(db:FuelDatabase,owner:string,query?:string):{id:string;selection:LocationSelection;alias:string}[]{
  const tokens=query?addressQueryTokens(query):[];
  const filter=tokens.map(()=>" AND search_text LIKE ? ESCAPE '!'").join('');
  const rows=db.prepare(`SELECT * FROM user_address_history WHERE user_id=?${filter} ORDER BY updated_at DESC LIMIT ${query?1000:200}`)
    .all(owner,...tokens.map(token=>`%${token}%`)) as any[];
  return rows.flatMap(row=>{try{return [{id:row.id,selection:JSON.parse(row.selection_json),alias:row.query_alias}];}catch{return [];}});
}
export function registerAddressRoutes(app:Express,{db,limit}:{db:FuelDatabase;limit:(key:string,max:number,window:number)=>void}){
  // Both routes use the same local index. Old APKs also stop calling Photon.
  app.get(['/api/addresses/search','/api/locations/search'],(req,res)=>{
    limit(`address-search:${clientIp(req)}`,120,60000);
    const q=typeof req.query.q==='string'?req.query.q.trim().replace(/\s+/g,' '):'';
    if(q.length<3||q.length>150)throw new ApiError('Pesquise um nome, rua ou CEP de 3 a 150 caracteres.');
    const size=req.query.limit===undefined?10:Number(req.query.limit);
    if(!Number.isInteger(size)||size<1||size>20)throw new ApiError('O limite deve estar entre 1 e 20.');
    const hasBias=req.query.lat!==undefined||req.query.lng!==undefined;
    const bias=hasBias?validate(()=>validateCoordinates([[Number(req.query.lat),Number(req.query.lng)]]))[0]:undefined;
    const owner=user(res)?.id;
    const personal=owner?history(db,owner,q).filter(record=>addressMatches(q,record.selection,record.alias)).map(record=>record.selection):[];
    const saved=owner?(db.prepare('SELECT * FROM user_saved_locations WHERE user_id=? ORDER BY saved_at DESC LIMIT 50').all(owner) as any[])
      .map(row=>({...row,parts_json:JSON.stringify(parseAddressParts(row.address))})).map(addressDto).filter(place=>addressMatches(q,place)):[];
    let matches=rankLocationSuggestions(q,[...personal,...saved,...publicAddressMatches(db,q)],bias);
    const postcode=requestedPostcode(q);if(postcode)matches=matches.filter(place=>matchingPostcode(place,postcode));
    const number=requestedHouseNumber(q);
    const numbered=number?matches.filter(place=>matchingHouseNumber(place,number)):matches;
    // A known point on a street only starts the picker. It never substitutes
    // another house number or invents coordinates for an unknown residence.
    const streetQuery=streetQueryForManualPin(q);
    if(isStreetAddressQuery(q)&&streetQuery&&(!number||!numbered.length)){
      const reference=rankLocationSuggestions(streetQuery,publicAddressMatches(db,streetQuery),bias)[0];
      if(reference?.coords){const parts=parseAddressParts(streetQuery);
        const street:LocationSelection={name:parts.street||streetQuery,address:streetQuery,coords:reference.coords,
          category:'street',requiresPin:true,addressParts:parts,sourceUrl:reference.sourceUrl};
        matches=number?[street]:[street,...numbered];
      }else matches=number?[]:matches;
    }else matches=numbered;
    res.json({results:matches.slice(0,size),cached:true,source:'role',externalRequests:0});
  });
  app.get('/api/addresses/stats',(_req,res)=>{
    const rows=db.prepare('SELECT source_kind AS source,COUNT(*) AS count FROM address_index GROUP BY source_kind').all() as any[];
    res.json({source:'role',total:rows.reduce((total,row)=>total+row.count,0),sources:rows,externalRequests:0});
  });
  app.get('/api/addresses/:id',(req,res)=>{
    const row=db.prepare(`SELECT a.* FROM address_index a WHERE a.id=? AND NOT EXISTS(SELECT 1 FROM stations s WHERE s.id=a.id AND s.active=0)`).get(req.params.id);
    if(!row)throw new ApiError('Endereço não cadastrado.',404);
    res.json(addressDto(row));
  });
  app.post('/api/me/addresses',auth,(req,res)=>{
    const owner=user(res).id;limit(`remember-address:${owner}`,60,60000);
    if(req.body?.accountId!==undefined&&req.body.accountId!==owner)throw new ApiError('A conta mudou. Entre novamente para guardar esse endereço.',409);
    const input=req.body?.selection;
    const query=typeof req.body?.query==='string'?req.body.query.trim():'';
    if(!input||typeof input!=='object'||!query||query.length>150)throw new ApiError('Escolha um endereço antes de guardar.');
    let selection:LocationSelection;
    if(input.category==='manual'){
      if(typeof input.name!=='string'||input.name.trim().length<3||input.name.length>150||
        typeof input.address!=='string'||input.address.length<3||input.address.length>350)throw new ApiError('Endereço inválido.');
      const coords=validate(()=>validateCoordinates([input.coords]))[0];
      const parts=parseAddressParts(input.address);
      const explicit=input.addressParts as AddressParts|undefined;
      if(explicit&&typeof explicit!=='object')throw new ApiError('Dados do endereço inválidos.');
      if(explicit)for(const key of ['street','houseNumber','postcode','neighborhood','city','state','country'] as const){
        const value=explicit[key];if(value===undefined)continue;
        if(typeof value!=='string'||value.length>150)throw new ApiError('Dados do endereço inválidos.');
        parts[key]=value.trim();
      }
      if(parts.postcode){parts.postcode=normalizePostcode(parts.postcode);if(parts.postcode.length!==8)throw new ApiError('Use um CEP de 8 dígitos.');}
      if(parts.houseNumber&&!/^\d{1,6}[a-z]?$/i.test(parts.houseNumber))throw new ApiError('Número do imóvel inválido.');
      selection={name:input.name.trim(),address:input.address.trim(),coords,category:'manual',addressParts:parts};
    }else{
      if(typeof input.id!=='string'||input.id.length>150)throw new ApiError('Selecione um endereço cadastrado ou marque o ponto no mapa.');
      const row=db.prepare(`SELECT a.* FROM address_index a WHERE a.id=? AND NOT EXISTS(SELECT 1 FROM stations s WHERE s.id=a.id AND s.active=0)`).get(input.id);
      if(!row)throw new ApiError('Endereço não encontrado na base do Rolê.',404);
      selection=addressDto(row);
    }
    const id=createHash('sha256').update(JSON.stringify([selection.id||'',addressSearchText(selection.name,selection.address||'',selection.addressParts),selection.coords])).digest('hex');
    const old=db.prepare('SELECT query_alias FROM user_address_history WHERE user_id=? AND id=?').get(owner,id) as any;
    const aliases=[...new Set([query,old?.query_alias||''].filter(Boolean))].join(' ').slice(0,600);
    db.prepare(`INSERT INTO user_address_history VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET
      selection_json=excluded.selection_json,query_alias=excluded.query_alias,search_text=excluded.search_text,updated_at=excluded.updated_at`)
      .run(owner,id,JSON.stringify(selection),aliases,addressSearchText(selection.name,`${selection.address||''} ${aliases}`,selection.addressParts),now());
    res.status(201).json({saved:true,id,selection});
  });
  app.get('/api/me/addresses',auth,(_req,res)=>{
    const records=history(db,user(res).id);
    const saved=(db.prepare('SELECT * FROM user_saved_locations WHERE user_id=? ORDER BY saved_at DESC LIMIT 50').all(user(res).id) as any[]).map(addressDto);
    res.json({results:rankLocationSuggestions('',[...records.map(record=>record.selection),...saved]).slice(0,200)});
  });
  app.delete('/api/me/addresses',auth,(_req,res)=>{
    db.prepare('DELETE FROM user_address_history WHERE user_id=?').run(user(res).id);
    db.prepare('DELETE FROM user_saved_locations WHERE user_id=?').run(user(res).id);
    res.json({ok:true});
  });
}
