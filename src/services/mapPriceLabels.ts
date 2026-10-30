import type { FuelPrice, FuelStation } from '../types/fuel';
import type { RouteToll } from '../types/tolls';

const currency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fuelShortName: Record<string, string> = {
  gasolina_comum: 'Gasolina',
  gasolina_aditivada: 'Aditivada',
  etanol: 'Etanol',
  diesel_comum: 'Diesel',
  diesel_s10: 'Diesel S10',
  gnv: 'GNV',
  eletrico: 'Recarga'
};

/** Só preços publicados, atuais e não contestados fornecidos pela API. */
export function fuelPriceLabel(station: Pick<FuelStation, 'prices'>): string | null {
  const available = station.prices.filter((price: FuelPrice) =>
    Number.isFinite(price.price) && price.price > 0 && !price.stale && !price.disputed
  );
  const preferred = available.find(price => price.fuelType === 'gasolina_comum') || available[0];
  if (!preferred) return null;
  return `${fuelShortName[preferred.fuelType] || preferred.customLabel || 'Combustível'} ${currency(preferred.price)}`;
}

/** Nunca usar a soma da viagem como tarifa unitária. Sem tarifa confirmada, omitir. */
export function tollPriceLabel(toll: Pick<RouteToll, 'price' | 'validUntil'>, now = Date.now()): string | null {
  if (toll.price === null || !Number.isFinite(toll.price) || toll.price < 0) return null;
  if (toll.validUntil) {
    const expiry = Date.parse(toll.validUntil);
    if (!Number.isFinite(expiry) || expiry < now) return null;
  }
  return `Pedágio ${currency(toll.price)}`;
}

/** Show every named fuel independently; never mix premium/S10 with common prices. */
export const FUEL_BALLOON_TYPES = [
  {label:'Gasolina comum',fuelType:'gasolina_comum'},
  {label:'Gasolina aditivada',fuelType:'gasolina_aditivada'},
  {label:'Gasolina premium',customLabel:'Gasolina premium'},
  {label:'Shell V-Power',customLabel:'Shell V-Power'},
  {label:'Etanol',fuelType:'etanol'},
  {label:'Etanol aditivado',customLabel:'Etanol aditivado'},
  {label:'Diesel comum / S500',fuelType:'diesel_comum'},
  {label:'Diesel S10',fuelType:'diesel_s10'},
  {label:'GNV',fuelType:'gnv'}
] as const;
export function fuelBalloonRows(prices:readonly FuelPrice[]){
  const current=prices.filter(p=>Number.isFinite(p.price)&&p.price>0&&!p.stale&&!p.disputed)
    .slice().sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt));
  return FUEL_BALLOON_TYPES.map(group=>{
    const price=current.find(p=>'fuelType' in group?p.fuelType===group.fuelType:
      p.fuelType==='outro'&&p.customLabel?.trim().toLocaleLowerCase('pt-BR')===group.customLabel.toLocaleLowerCase('pt-BR'));
    return {label:group.label,value:price?`R$ ${price.price.toFixed(3).replace('.',',')}/${price.fuelType==='gnv'?'m³':'L'}`:null};
  });
}
