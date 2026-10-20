import type { FuelDatabase } from './db';
import type { Coordinates, MapFetch } from './maps';
import type { Place } from '../src/types/admin';

/**
 * Regional import seeds. Coordinates are approximate search centers, NOT
 * invented POIs or pre-calculated road geometries. Operator chooses regions.
 */
export const TOURISM_REGIONS = {
  'sao-paulo': { label: 'São Paulo e arredores', coords: [-23.5505, -46.6333], radiusKm: 35 },
  'rio-de-janeiro': { label: 'Rio de Janeiro e arredores', coords: [-22.9068, -43.1729], radiusKm: 35 },
  'belo-horizonte': { label: 'Belo Horizonte e arredores', coords: [-19.9167, -43.9345], radiusKm: 35 },
  'curitiba': { label: 'Curitiba e arredores', coords: [-25.4284, -49.2733], radiusKm: 35 },
  'florianopolis': { label: 'Florianópolis e arredores', coords: [-27.5954, -48.5480], radiusKm: 35 },
  'porto-alegre': { label: 'Porto Alegre e arredores', coords: [-30.0346, -51.2177], radiusKm: 35 },
  'brasilia': { label: 'Brasília e arredores', coords: [-15.7939, -47.8828], radiusKm: 35 },
  'salvador': { label: 'Salvador e arredores', coords: [-12.9714, -38.5014], radiusKm: 35 },
  'recife': { label: 'Recife e arredores', coords: [-8.0476, -34.8770], radiusKm: 35 },
  'fortaleza': { label: 'Fortaleza e arredores', coords: [-3.7319, -38.5267], radiusKm: 35 },
  'natal': { label: 'Natal e arredores', coords: [-5.7945, -35.2110], radiusKm: 35 },
  'joao-pessoa': { label: 'João Pessoa e arredores', coords: [-7.1195, -34.8450], radiusKm: 35 },
  'maceio': { label: 'Maceió e arredores', coords: [-9.6658, -35.7353], radiusKm: 35 },
  'aracaju': { label: 'Aracaju e arredores', coords: [-10.9472, -37.0731], radiusKm: 35 },
  'sao-luis': { label: 'São Luís e arredores', coords: [-2.5307, -44.3068], radiusKm: 35 },
  'belem': { label: 'Belém e arredores', coords: [-1.4558, -48.4902], radiusKm: 35 },
  'manaus': { label: 'Manaus e arredores', coords: [-3.1190, -60.0217], radiusKm: 35 },
  'goiania': { label: 'Goiânia e arredores', coords: [-16.6869, -49.2648], radiusKm: 35 },
  'cuiaba': { label: 'Cuiabá e arredores', coords: [-15.6014, -56.0979], radiusKm: 35 },
  'campo-grande': { label: 'Campo Grande e arredores', coords: [-20.4697, -54.6201], radiusKm: 35 },
  'vitoria': { label: 'Vitória e arredores', coords: [-20.3155, -40.3128], radiusKm: 35 },
  'teresina': { label: 'Teresina e arredores', coords: [-5.0892, -42.8016], radiusKm: 35 },
  'palmas': { label: 'Palmas e arredores', coords: [-10.2491, -48.3243], radiusKm: 35 },
  'porto-velho': { label: 'Porto Velho e arredores', coords: [-8.7612, -63.9004], radiusKm: 35 },
  'rio-branco': { label: 'Rio Branco e arredores', coords: [-9.9749, -67.8243], radiusKm: 35 },
  'macapa': { label: 'Macapá e arredores', coords: [0.0389, -51.0664], radiusKm: 35 },
  'boa-vista': { label: 'Boa Vista e arredores', coords: [2.8235, -60.6758], radiusKm: 35 },
  'foz-do-iguacu': { label: 'Foz do Iguaçu e arredores', coords: [-25.5478, -54.5882], radiusKm: 35 },
  'serra-gaucha': { label: 'Serra Gaúcha', coords: [-29.3783, -50.8765], radiusKm: 35 },
  'chapada-diamantina': { label: 'Chapada Diamantina', coords: [-12.5602, -41.3899], radiusKm: 35 },
  'serra-da-canastra': { label: 'Serra da Canastra', coords: [-20.2793, -46.4145], radiusKm: 35 }
} as const;
export type TourismRegionKey = keyof typeof TOURISM_REGIONS;
export type TourismRecord = Pick<Place, 'id'|'name'|'kind'|'lat'|'lng'|'address'|'sourceUrl'|'description'|'website'|'phone'|'openingHours'>;

const MAX_ELEMENTS=500;
const roadTypes='^(secondary|tertiary|unclassified|residential|living_street)$';

/** No unlimited countrywide query: one bounded Overpass query per selected region. */
export function touristOverpassQuery(coords:Coordinates,radiusKm:number):string {
  if(!Number.isFinite(coords[0])||!Number.isFinite(coords[1])||
     Math.abs(coords[0])>90||Math.abs(coords[1])>180||
     !Number.isFinite(radiusKm)||radiusKm<1||radiusKm>40)
    throw new Error('Região de importação inválida (raio entre 1 e 40 km).');
  const around=`(around:${Math.round(radiusKm*1000)},${coords[0]},${coords[1]})`;
  return `[out:json][timeout:25];(
    nwr${around}["tourism"~"^(museum|gallery|viewpoint|attraction|zoo)$"]["name"];
    nwr${around}["amenity"="theatre"]["name"];
    nwr${around}["leisure"~"^(park|nature_reserve)$"]["name"];
    nwr${around}["waterway"="waterfall"]["name"];
    nwr${around}["natural"="beach"]["name"];
    nwr${around}["historic"]["name"];
    way${around}["highway"~"${roadTypes}"]["scenic"="yes"]["name"];
  );out center ${MAX_ELEMENTS};`;
}

export function parseTouristOsm(element:unknown):TourismRecord|null {
  if(!element||typeof element!=='object')return null;
  const e=element as {type?:string;id?:number;lat?:number;lon?:number;center?:{lat?:number;lon?:number};tags?:Record<string,unknown>};
  if(!['node','way','relation'].includes(e.type||'')||!Number.isSafeInteger(e.id)||!e.id||e.id<1)return null;
  const tags=e.tags;
  if(!tags||typeof tags!=='object')return null;
  const str=(v:unknown,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';
  const name=str(tags['name:pt']||tags.name,150);
  const lat=e.type==='node'?e.lat:e.center?.lat,lng=e.type==='node'?e.lon:e.center?.lon;
  if(!name||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat!)>90||Math.abs(lng!)>180) return null;
  if(tags.access==='private'||tags.access==='no'||tags.disused==='yes'||tags.abandoned==='yes')return null;

  let kind:TourismRecord['kind']|null=null;
  if(tags.amenity==='theatre')kind='theatre';
  else if(tags.tourism==='museum'||tags.tourism==='gallery')kind='museum';
  else if(tags.tourism==='viewpoint')kind='viewpoint';
  else if(tags.waterway==='waterfall')kind='waterfall';
  else if(tags.leisure==='nature_reserve')kind='nature_reserve';
  else if(tags.leisure==='park')kind='park';
  else if(tags.natural==='beach')kind='beach';
  else if(tags.historic)kind='historic';
  else if(tags.tourism==='attraction'||tags.tourism==='zoo')kind='attraction';
  else if(e.type==='way'&&tags.scenic==='yes'&&
    typeof tags.highway==='string'&&/^(secondary|tertiary|unclassified|residential|living_street)$/.test(tags.highway)&&
    tags.motor_vehicle!=='no'&&tags.motorcar!=='no'&&tags.motorcycle!=='no'&&tags.access!=='destination')
    kind='scenic_road';
  if(!kind)return null;

  const addr=[tags['addr:street'],tags['addr:housenumber'],tags['addr:city']]
    .map(v=>str(v,90)).filter(Boolean).join(', ').slice(0,250);
  const url=str(tags.website,300);
  return {
    id:`osm:${e.type}:${e.id}`,name,kind,lat:lat!,lng:lng!,address:addr,
    sourceUrl:`https://www.openstreetmap.org/${e.type}/${e.id}`,
    description:kind==='scenic_road'
      ?'Ponto de referência de uma estrada marcada como cênica no OpenStreetMap. Confira acesso e condições da via.'
      :'Local mapeado no OpenStreetMap. Confira horários e acessibilidade antes de visitar.',
    website:/^https?:\/\//.test(url)?url:'',
    phone:str(tags.phone,50),openingHours:str(tags.opening_hours,200)||undefined
  };
}

export async function importTourismRegion(db:FuelDatabase,options:{
  coords:Coordinates;radiusKm:number;fetcher?:MapFetch
}):Promise<{received:number;valid:number;inserted:number;updated:number;unchanged:number}> {
  const query=touristOverpassQuery(options.coords,options.radiusKm);
  const response=await (options.fetcher||fetch)(process.env.OVERPASS_URL||'https://overpass-api.de/api/interpreter',{
    method:'POST',body:new URLSearchParams({data:query}),
    signal:AbortSignal.timeout(30000),
    headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'RoleTurismoCatalog/1.0'}
  });
  if(!response.ok)throw new Error(`OpenStreetMap/Overpass indisponível (HTTP ${response.status}). Sem alterações na base.`);
  const json=await response.json() as {elements?:unknown};
  if(!Array.isArray(json.elements))throw new Error('Resposta inválida do catálogo OSM. Nenhum registro importado.');
  const elements=json.elements.slice(0,MAX_ELEMENTS);
  const records=[...new Map(elements.map(parseTouristOsm).filter((p):p is TourismRecord=>!!p).map(p=>[p.id,p])).values()];
  const stamp=new Date().toISOString();
  const current=db.prepare('SELECT active,managed FROM stations WHERE id=?');
  const place=db.prepare(`INSERT INTO stations
    (id,name,lat,lng,address,source_url,opening_hours,map_updated_at,kind,active,managed,description,website,phone)
    VALUES(?,?,?,?,?,?,?,?,?,1,0,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,lat=excluded.lat,lng=excluded.lng,
      address=excluded.address,source_url=excluded.source_url,
      opening_hours=excluded.opening_hours,map_updated_at=excluded.map_updated_at,
      kind=excluded.kind,description=excluded.description,website=excluded.website,phone=excluded.phone
    WHERE stations.managed=0 AND stations.active=1`);
  const location=db.prepare(`INSERT INTO locations(id,name,address,lat,lng,source_url,category,updated_at)
    VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,address=excluded.address,
      lat=excluded.lat,lng=excluded.lng,source_url=excluded.source_url,
      category=excluded.category,updated_at=excluded.updated_at`);
  let inserted=0,updated=0,unchanged=0;
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const item of records){
      const before=current.get(item.id) as {active:number;managed:number}|undefined;
      if(before&&(before.managed===1||before.active===0)){unchanged++;continue;}
      place.run(item.id,item.name,item.lat,item.lng,item.address,item.sourceUrl,
        item.openingHours||null,stamp,item.kind,item.description,item.website,item.phone);
      location.run(item.id,item.name,item.address,item.lat,item.lng,item.sourceUrl,item.kind,stamp);
      if(before)updated++;else inserted++;
    }
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return {received:elements.length,valid:records.length,inserted,updated,unchanged};
}
