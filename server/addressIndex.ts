import type {FuelDatabase} from './db';
import type {AddressParts} from '../src/types/address';
import type {LocationSelection} from '../src/types/itinerary';
import {EXPLORE_CATALOG} from '../src/catalogs/explore';
import {addressQueryTokens,addressSearchText,parseAddressParts} from '../src/services/addressDetails';

export function addressDto(row:any):LocationSelection {
  let addressParts:AddressParts={};
  try{addressParts=JSON.parse(row.parts_json||'{}');}catch{/* Legacy rows keep their original label. */}
  if(!Object.keys(addressParts).length)addressParts=parseAddressParts(row.address||'');
  return {id:row.id,name:row.name,address:row.address,coords:[row.lat,row.lng],sourceUrl:row.source_url,
    category:row.category,addressParts};
}
function hydrateAddressParts(db:FuelDatabase,rows:any[]):void{
  const update=db.prepare(`UPDATE address_index SET street=?,house_number=?,postcode=?,parts_json=?,search_text=? WHERE id=? AND address=?`);
  for(const row of rows){
    if(row.parts_json!=='{}'||!row.address)continue;
    const parts=parseAddressParts(row.address);
    row.parts_json=JSON.stringify(parts);
    update.run(parts.street||'',parts.houseNumber||'',parts.postcode||'',row.parts_json,addressSearchText(row.name,row.address,parts),row.id,row.address);
  }
}
export function upsertPublicAddress(db:FuelDatabase,place:LocationSelection,source:'catalog'|'import'){
  if(!place.id||!place.coords)throw Error('Endereço público sem identificação ou coordenadas.');
  const parts={...parseAddressParts(place.address||''),...place.addressParts};
  db.prepare(`INSERT INTO address_index(id,name,address,street,house_number,postcode,parts_json,lat,lng,source_url,category,source_kind,search_text,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,address=excluded.address,
    street=excluded.street,house_number=excluded.house_number,postcode=excluded.postcode,parts_json=excluded.parts_json,
    lat=excluded.lat,lng=excluded.lng,source_url=excluded.source_url,category=excluded.category,search_text=excluded.search_text,updated_at=excluded.updated_at
    WHERE address_index.source_kind=excluded.source_kind AND (address_index.search_text<>excluded.search_text OR address_index.address<>excluded.address OR address_index.parts_json<>excluded.parts_json OR address_index.lat<>excluded.lat OR address_index.lng<>excluded.lng OR address_index.source_url<>excluded.source_url)`)
    .run(place.id,place.name,place.address||'',parts.street||'',parts.houseNumber||'',parts.postcode||'',JSON.stringify(parts),
      ...place.coords,place.sourceUrl||'',place.category||'address',source,addressSearchText(place.name,place.address||'',parts),new Date().toISOString());
}

/** Sources remain authoritative. SQLite triggers immediately track edits,
 * removals and imports; private address history never enters this index. */
export function initializeAddressIndex(db:FuelDatabase){
  db.exec(`CREATE TABLE IF NOT EXISTS address_index (
    id TEXT PRIMARY KEY,name TEXT NOT NULL,address TEXT NOT NULL,street TEXT NOT NULL DEFAULT '',
    house_number TEXT NOT NULL DEFAULT '',postcode TEXT NOT NULL DEFAULT '',parts_json TEXT NOT NULL DEFAULT '{}',
    lat REAL NOT NULL CHECK(lat BETWEEN -90 AND 90),lng REAL NOT NULL CHECK(lng BETWEEN -180 AND 180),
    source_url TEXT NOT NULL DEFAULT '',category TEXT NOT NULL,source_kind TEXT NOT NULL,
    search_text TEXT NOT NULL,updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS addresses_postcode ON address_index(postcode,house_number);
  CREATE VIRTUAL TABLE IF NOT EXISTS address_search USING fts5(search_text,content='address_index',content_rowid='rowid',tokenize='unicode61 remove_diacritics 2',prefix='2 3 4');
  CREATE TRIGGER IF NOT EXISTS address_search_insert AFTER INSERT ON address_index BEGIN
    INSERT INTO address_search(rowid,search_text) VALUES(new.rowid,new.search_text);END;
  CREATE TRIGGER IF NOT EXISTS address_search_delete AFTER DELETE ON address_index BEGIN
    INSERT INTO address_search(address_search,rowid,search_text) VALUES('delete',old.rowid,old.search_text);END;
  CREATE TRIGGER IF NOT EXISTS address_search_update AFTER UPDATE ON address_index BEGIN
    INSERT INTO address_search(address_search,rowid,search_text) VALUES('delete',old.rowid,old.search_text);
    INSERT INTO address_search(rowid,search_text) VALUES(new.rowid,new.search_text);END;
  CREATE TABLE IF NOT EXISTS user_address_history (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,id TEXT NOT NULL,
    selection_json TEXT NOT NULL,query_alias TEXT NOT NULL,search_text TEXT NOT NULL,updated_at TEXT NOT NULL,
    PRIMARY KEY(user_id,id)
  );
  CREATE INDEX IF NOT EXISTS user_addresses_recent ON user_address_history(user_id,updated_at DESC);`);

  const sourceSql=(table:'locations'|'stations',alias:string)=>{
    const place=table==='stations',kind=place?'place':'cache';
    const col=(name:string)=>`${alias}.${name}`;
    const valid=`${col('lat')} BETWEEN -90 AND 90 AND ${col('lng')} BETWEEN -180 AND 180 AND typeof(${col('lat')}) IN ('integer','real') AND typeof(${col('lng')}) IN ('integer','real')`;
    return `INSERT INTO address_index(id,name,address,street,house_number,postcode,parts_json,lat,lng,source_url,category,source_kind,search_text,updated_at)
      SELECT ${col('id')},${col('name')},${col('address')},'','','','{}',
      ${col('lat')},${col('lng')},${col('source_url')},${col(place?'kind':'category')},'${kind}',
      ${col('name')}||' '||${col('address')}||' '||replace(${col('address')},'-',''),${col(place?'map_updated_at':'updated_at')}
      ${alias==='new'?'':`FROM ${table} ${alias}`}
      WHERE (${place?`${col('active')}=1`:`NOT EXISTS(SELECT 1 FROM stations WHERE stations.id=${col('id')})`}) AND ${valid}
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,address=excluded.address,street=excluded.street,
      house_number=excluded.house_number,postcode=excluded.postcode,parts_json=excluded.parts_json,lat=excluded.lat,lng=excluded.lng,
      source_url=excluded.source_url,category=excluded.category,source_kind=excluded.source_kind,search_text=excluded.search_text,updated_at=excluded.updated_at
      WHERE (address_index.source_kind<>'place' OR excluded.source_kind='place') AND
      (address_index.name<>excluded.name OR address_index.address<>excluded.address OR
       address_index.lat<>excluded.lat OR address_index.lng<>excluded.lng OR address_index.source_url<>excluded.source_url OR
       address_index.category<>excluded.category OR address_index.source_kind<>excluded.source_kind)`;
  };
  // Source triggers use only built-in SQLite operations. An earlier app
  // version or an ordinary SQLite import can still write these source tables.
  for(const table of ['locations','stations'] as const){
    for(const event of ['INSERT','UPDATE'])db.exec(`CREATE TRIGGER IF NOT EXISTS addresses_${table}_${event.toLowerCase()}
      AFTER ${event} ON ${table} BEGIN
      DELETE FROM address_index WHERE id=new.id AND source_kind='${table==='stations'?'place':'cache'}' AND
      (${table==='stations'?'new.active=0 OR ':''}NOT(new.lat BETWEEN -90 AND 90 AND new.lng BETWEEN -180 AND 180)
       OR typeof(new.lat) NOT IN ('integer','real') OR typeof(new.lng) NOT IN ('integer','real'));
      ${sourceSql(table,'new')};END;`);
    db.exec(`CREATE TRIGGER IF NOT EXISTS addresses_${table}_delete AFTER DELETE ON ${table} BEGIN
      DELETE FROM address_index WHERE id=old.id AND source_kind='${table==='stations'?'place':'cache'}';END;`);
    db.exec(sourceSql(table,'s'));
  }
  hydrateAddressParts(db,db.prepare("SELECT * FROM address_index WHERE parts_json='{}' AND address<>''").all() as any[]);
  for(const place of EXPLORE_CATALOG)upsertPublicAddress(db,{id:place.id,name:place.name,address:place.address,coords:place.coords,
    sourceUrl:place.sourceUrl||place.coordinateSource,category:place.kind,addressParts:{city:place.city||undefined}},'catalog');
}

export function publicAddressMatches(db:FuelDatabase,query:string):LocationSelection[]{
  const tokens=addressQueryTokens(query);
  if(!tokens.length)return [];
  const aliases:Record<string,string[]>={rua:['rua','r'],avenida:['avenida','av','avda'],rodovia:['rodovia','rod'],estrada:['estrada','estr'],praca:['praca','pca']};
  const expression=tokens.map(token=>aliases[token]?`(${aliases[token].map(word=>`"${word}"`).join(' OR ')})`:`"${token}"${/^\d+$/.test(token)?'':'*'}`).join(' AND ');
  const rows=db.prepare(`SELECT a.* FROM address_search JOIN address_index a ON a.rowid=address_search.rowid
    WHERE address_search MATCH ? AND NOT EXISTS(SELECT 1 FROM stations s WHERE s.id=a.id AND s.active=0)
    ORDER BY rank LIMIT 100`).all(expression) as any[];
  hydrateAddressParts(db,rows);return rows.map(addressDto);
}
