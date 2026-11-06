import {createHash} from 'node:crypto';
import type {Express} from 'express';
import type {FuelDatabase} from './db';
import type {MapFetch} from './maps';
import {ApiError,asyncRoute,clientIp} from './http';
import {EXPLORE_CATALOG} from '../src/catalogs/explore';
import type {PlacePhoto} from '../src/types/placePhoto';

const catalog=new Map(EXPLORE_CATALOG.map(place=>[place.id,place]));
type Source={id:string;fingerprint:string;osm?:string;file?:string;wiki?:string;entity?:string};
const clean=(value:unknown)=>typeof value==='string'?value.replace(/<[^>]*>/g,'').replace(/&(?:amp|quot|lt|gt|#39);/g,
  entity=>({'&amp;':'&','&quot;':'"','&lt;':'<','&gt;':'>','&#39;':"'"}[entity]!)).trim().slice(0,300):'';
const commonsFile=(value:unknown):string|undefined=>{
  if(typeof value!=='string'||value.length>700)return;
  if(/^File:[^|\n]+$/i.test(value))return value;
  try{const url=new URL(value);if(url.protocol==='https:'&&url.hostname==='commons.wikimedia.org'&&url.pathname.startsWith('/wiki/File:'))
    return decodeURIComponent(url.pathname.slice(6));}catch{/* No arbitrary image URLs. */}
};
const wikipedia=(value:unknown):string|undefined=>{
  if(typeof value!=='string')return;
  if(/^[a-z]{2,3}(?:-[a-z]+)?:[^|\n]{1,300}$/.test(value))return value;
  try{const url=new URL(value),lang=url.hostname.match(/^([a-z]{2,3}(?:-[a-z]+)?)\.wikipedia\.org$/)?.[1];
    if(url.protocol==='https:'&&lang&&url.pathname.startsWith('/wiki/'))return `${lang}:${decodeURIComponent(url.pathname.slice(6))}`;
  }catch{/* Only an exact linked article can identify the place. */}
};
const imageUrl=(value:unknown)=>{
  try{const url=new URL(String(value));return url.protocol==='https:'&&['upload.wikimedia.org','thumb.wikimedia.org'].includes(url.hostname)&&!url.username&&!url.password?url.href:null;}
  catch{return null;}
};

/** Resolve exact OSM/Wikipedia/Wikidata links, never a name/image search.
 * Batch each upstream stage and persist credits and misses, so scrolling does
 * not make one external request per card or hold up map/place discovery. */
export function createPlacePhotoLoader(db:FuelDatabase,mapFetch:MapFetch=fetch){
  db.exec('CREATE TABLE IF NOT EXISTS place_photo_cache (id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,payload TEXT NOT NULL,expires_at INTEGER NOT NULL)');
  let pending=Promise.resolve();
  const load=async(ids:string[]):Promise<Record<string,PlacePhoto|null>>=>{
    const result:Record<string,PlacePhoto|null>={},sources:Source[]=[];
    for(const id of [...new Set(ids)]){
      const place=catalog.get(id);
      const row=db.prepare('SELECT name,source_url,lat,lng FROM stations WHERE id=? AND active=1').get(id) as any;
      if(!row&&!place){result[id]=null;continue;}
      const sourceUrl=row?.source_url||place?.sourceUrl||'';
      const identity=JSON.stringify([sourceUrl,row?.name||place?.name,row?.lat??place?.coords[0],row?.lng??place?.coords[1],place?.photoPage,place?.coordinateSource]);
      const fingerprint=createHash('sha256').update(identity).digest('hex');
      const cached=db.prepare('SELECT payload FROM place_photo_cache WHERE id=? AND fingerprint=? AND expires_at>?').get(id,fingerprint,Date.now()) as any;
      if(cached){result[id]=JSON.parse(cached.payload);continue;}
      const osm=sourceUrl.match(/^https:\/\/(?:www\.)?openstreetmap\.org\/(node|way|relation)\/(\d{1,16})(?:[?#].*)?$/);
      sources.push({id,fingerprint,osm:osm&&Number.isSafeInteger(Number(osm[2]))?`${osm[1]}(${osm[2]});`:undefined,
        file:commonsFile(place?.photoPage),wiki:wikipedia(place?.coordinateSource)});
    }
    if(!sources.length)return result;
    let degraded=false;
    const json=async(url:string,init?:RequestInit)=>{
      const response=await mapFetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(7000),headers:{
        'User-Agent':'Role/1.0 (place photographs; https://github.com/DiegoMatheusS/Roteiro-de-Viagem)',Accept:'application/json',...init?.headers}});
      if(!response.ok)throw Error('Photo source unavailable');
      return response.json() as Promise<any>;
    };
    const api=(host:string,params:Record<string,string>)=>`https://${host}/w/api.php?${new URLSearchParams({format:'json',formatversion:'2',...params})}`;
    const osmSources=sources.filter(source=>source.osm&&!source.file);
    if(osmSources.length)try{
      const data=await json(process.env.OVERPASS_URL||'https://overpass-api.de/api/interpreter',{
        method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:`[out:json][timeout:6];(${osmSources.map(source=>source.osm).join('')});out tags;`})});
      const tags=new Map((data.elements||[]).map((item:any)=>[`${item.type}(${item.id});`,item.tags||{}]));
      for(const source of osmSources){
        const tag=tags.get(source.osm) as Record<string,string>|undefined;
        source.file=commonsFile(tag?.wikimedia_commons)||commonsFile(tag?.image);
        source.wiki=wikipedia(tag?.wikipedia)||source.wiki;
        // brand:wikidata and operator:wikidata describe chains, not this building.
        if(/^Q\d{1,16}$/.test(tag?.wikidata||''))source.entity=tag!.wikidata;
      }
    }catch{degraded=true;}
    const byLanguage=new Map<string,Source[]>();
    for(const source of sources.filter(item=>!item.file&&!item.entity&&item.wiki)){
      const lang=source.wiki!.split(':')[0];byLanguage.set(lang,[...(byLanguage.get(lang)||[]),source]);
    }
    for(const [lang,items] of byLanguage)try{
      const data=await json(api(`${lang}.wikipedia.org`,{action:'query',prop:'pageprops',ppprop:'wikibase_item',redirects:'1',titles:items.map(item=>item.wiki!.slice(lang.length+1)).join('|')}));
      const normalize=(value:string)=>value.replace(/_/g,' ');
      const redirects=new Map<string,string>([...(data.query?.normalized||[]),...(data.query?.redirects||[])].map((entry:any)=>[normalize(entry.from),normalize(entry.to)]));
      for(const source of items){
        let title=normalize(source.wiki!.slice(lang.length+1));
        for(let i=0;i<5&&redirects.has(title);i++)title=redirects.get(title)!;
        const entity=data.query?.pages?.find((page:any)=>normalize(page.title)===title)?.pageprops?.wikibase_item;
        if(/^Q\d{1,16}$/.test(entity||''))source.entity=entity;
      }
    }catch{degraded=true;}
    const entities=[...new Set(sources.filter(item=>!item.file&&item.entity).map(item=>item.entity!))];
    if(entities.length)try{
      const data=await json(api('www.wikidata.org',{action:'wbgetentities',ids:entities.join('|'),props:'claims'}));
      for(const source of sources.filter(item=>!item.file&&item.entity)){
        const claims=(data.entities?.[source.entity!]?.claims?.P18||[]).filter((claim:any)=>claim.rank!=='deprecated');
        const claim=claims.find((item:any)=>item.rank==='preferred')||claims[0];
        const file=claim?.mainsnak?.datavalue?.value;
        if(typeof file==='string')source.file=commonsFile(`File:${file}`);
      }
    }catch{degraded=true;}
    const files=[...new Set(sources.flatMap(item=>item.file?[item.file]:[]))];
    const resolved=new Map<string,PlacePhoto>();
    if(files.length)try{
      const data=await json(api('commons.wikimedia.org',{action:'query',prop:'imageinfo',titles:files.join('|'),redirects:'1',
        iiprop:'url|extmetadata|mime',iiurlwidth:'400',iiextmetadatalanguage:'pt',iiextmetadatafilter:'Artist|LicenseShortName|LicenseUrl'}));
      const pages=data.query?.pages||[];
      const aliases=new Map<string,string>([...(data.query?.normalized||[]),...(data.query?.redirects||[])].map((item:any)=>[item.from.replace(/_/g,' '),item.to.replace(/_/g,' ')]));
      for(const file of files){
        let title=file.replace(/_/g,' ');for(let i=0;i<5&&aliases.has(title);i++)title=aliases.get(title)!;
        const page=pages.find((item:any)=>item.title===title),info=page?.imageinfo?.[0];
        const photo=imageUrl(info?.thumburl),credit=clean(info?.extmetadata?.Artist?.value),license=clean(info?.extmetadata?.LicenseShortName?.value);
        if(!photo||!credit||!/^image\/(?:jpeg|png|webp)$/.test(info?.mime||'')||!/^(?:CC(?:\b|0\b)|Public domain)/i.test(license))continue;
        const licenseValue=info.extmetadata?.LicenseUrl?.value;
        const photoLicense=typeof licenseValue==='string'&&/^https:\/\/creativecommons\.org\//.test(licenseValue)?licenseValue:undefined;
        resolved.set(file,{photo,photoPage:`https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,photoCredit:`${credit} · ${license}`,photoLicense});
      }
    }catch{degraded=true;}
    const save=db.prepare('INSERT INTO place_photo_cache VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET fingerprint=excluded.fingerprint,payload=excluded.payload,expires_at=excluded.expires_at');
    for(const source of sources){
      const photo=source.file?resolved.get(source.file)||null:null;
      result[source.id]=photo;
      save.run(source.id,source.fingerprint,JSON.stringify(photo),Date.now()+(photo?7*86400000:degraded?5*60000:86400000));
    }
    return result;
  };
  return (ids:string[])=>{
    // Serialize batches across clients; the next batch reuses freshly cached entries.
    const task=pending.then(()=>load(ids));pending=task.then(()=>{},()=>{});return task;
  };
}

export function registerPlacePhotoRoutes(app:Express,{db,mapFetch,limit}:{db:FuelDatabase;mapFetch?:MapFetch;limit:(key:string,max:number,windowMs:number)=>void}){
  const load=createPlacePhotoLoader(db,mapFetch);
  app.post('/api/places/photos',asyncRoute(async(req,res)=>{
    const ids=req.body.ids;
    if(!Array.isArray(ids)||ids.length>20||ids.some(id=>typeof id!=='string'||!id||id.length>150))throw new ApiError('Escolha até 20 lugares.');
    limit(`place-photos:${clientIp(req)}`,20,60000);
    res.json({photos:await load(ids)});
  }));
}
