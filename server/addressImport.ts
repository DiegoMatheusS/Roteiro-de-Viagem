import {createHash} from 'node:crypto';
import type {FuelDatabase} from './db';
import type {AddressParts} from '../src/types/address';
import type {LocationSelection} from '../src/types/itinerary';
import {upsertPublicAddress} from './addressIndex';
import {normalizePostcode} from '../src/services/addressDetails';

/** Import trusted public datasets already available on disk; never geocode or
 * download anything as a side effect of importing a record. */
export function importPublicAddress(db:FuelDatabase,input:unknown):LocationSelection {
  const value=input as Record<string,unknown>;
  if(!value||typeof value!=='object')throw Error('Registro de endereço inválido.');
  const text=(name:string,max=150)=>{
    const field=value[name];if(field===undefined||field===null)return '';
    if(typeof field!=='string'||field.length>max)throw Error(`Campo ${name} inválido.`);
    return field.trim();
  };
  const coords=value.coords??[value.lat,value.lng];
  if(!Array.isArray(coords)||coords.length!==2||!coords.every(Number.isFinite)||Math.abs(coords[0])>90||Math.abs(coords[1])>180)throw Error('Coordenadas inválidas; use [latitude, longitude].');
  const parts:AddressParts={};
  for(const name of ['street','houseNumber','postcode','neighborhood','city','state','country'] as const){const field=text(name);if(field)parts[name]=field;}
  if(parts.postcode){parts.postcode=normalizePostcode(parts.postcode);if(parts.postcode.length!==8)throw Error('CEP inválido.');}
  if(parts.houseNumber&&!/^\d{1,6}[a-z]?$/i.test(parts.houseNumber))throw Error('Número do imóvel inválido.');
  const address=text('address',350)||[parts.street,parts.houseNumber,parts.neighborhood,parts.city,parts.state,parts.postcode,parts.country].filter(Boolean).join(', ');
  const name=text('name')||[parts.street,parts.houseNumber].filter(Boolean).join(', ').slice(0,150);
  if(name.length<3||!address)throw Error('Informe o nome/rua e o endereço.');
  const sourceUrl=text('sourceUrl',700);
  if(sourceUrl){try{if(new URL(sourceUrl).protocol!=='https:')throw Error();}catch{throw Error('Fonte inválida; use HTTPS.');}}
  const sourceId=text('id',120);
  const hash=createHash('sha256').update(JSON.stringify([name,address,coords])).digest('hex');
  const record:LocationSelection={id:`import:${sourceId||hash}`,name,address,coords:coords as [number,number],sourceUrl,
    category:text('category',50)||'address',addressParts:parts};
  upsertPublicAddress(db,record,'import');return record;
}
