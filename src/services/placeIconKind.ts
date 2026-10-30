import type {Place} from '../types/admin';

/** Some older OSM imports were registered as "Outro" or "Atração" even
 * though their verified name already identifies the type. Change only the
 * pictogram, never the persisted category, coordinates or details. */
export function placeIconKind(kind:Place['kind'],name=''):Place['kind']{
  const label=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLocaleLowerCase('pt-BR').trim();
  if(['park','other','attraction'].includes(kind)&&/^praca(?:\s|$)/.test(label))return 'square';
  // A specific category selected in the admin must always win over a name.
  if(kind!=='other'&&kind!=='attraction')return kind;
  if(/^parque(?:\s|$)/.test(label))return 'park';
  if(/^(teatro|theatro)(?:\s|$)/.test(label))return 'theatre';
  if(/^museu(?:\s|$)/.test(label))return 'museum';
  if(/^mirante(?:\s|$)/.test(label))return 'viewpoint';
  if(/^(cachoeira|cascata)(?:\s|$)/.test(label))return 'waterfall';
  if(/^praia(?:\s|$)/.test(label))return 'beach';
  if(/^trilha(?:\s|$)/.test(label))return 'trail';
  if(/^(reserva natural|reserva ecologica)(?:\s|$)/.test(label))return 'nature_reserve';
  if(/^(estrada cenica|estrada turistica)(?:\s|$)/.test(label))return 'scenic_road';
  if(/^(ponte estaiada|monumento)(?:\s|$)/.test(label))return 'landmark';
  if(/^shopping(?:\s|$)/.test(label))return 'shopping';
  if(/^hotel(?:\s|$)/.test(label))return 'hotel';
  if(/^(pousada|hospedaria)(?:\s|$)/.test(label))return 'inn';
  if(/^restaurante(?:\s|$)/.test(label))return 'restaurant';
  return kind;
}
