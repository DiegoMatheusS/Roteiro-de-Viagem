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

export function fuelBalloonRows(prices:readonly FuelPrice[]){
  const current=prices.filter(p=>Number.isFinite(p.price)&&p.price>0&&!p.stale&&!p.disputed)
    .slice().sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt));
  return [
    {label:'Gasolina',types:['gasolina_comum','gasolina_aditivada']},
    {label:'Etanol',types:['etanol']},
    {label:'Diesel',types:['diesel_comum','diesel_s10']}
  ].map(group=>{
    const price=group.types.map(type=>current.find(p=>p.fuelType===type)).find(Boolean);
    const label=price?.fuelType==='gasolina_aditivada'?'Gasolina aditivada':price?.fuelType==='diesel_s10'?'Diesel S10':group.label;
    return {label,value:price?`R$ ${price.price.toFixed(3).replace('.',',')}/L`:null};
  });
}
