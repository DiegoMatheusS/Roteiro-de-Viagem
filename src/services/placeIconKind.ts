import type {Place} from '../types/admin';
/** Older imports grouped named squares under parks/other. Resolve only their
 * pictogram; do not change the registered record or its verified coordinates. */
export function placeIconKind(kind:Place['kind'],name=''):Place['kind']{
  return ['park','other','attraction'].includes(kind)&&/^\s*pra[çc]a(?:\s|$)/iu.test(name)?'square':kind;
}
