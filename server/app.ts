import {createApi as createCoreApi} from './api';
import {sanitizePhoto} from './photos';
import {trafficRedOnlyPng} from './traffic';

export type ApiOptions=Omit<Parameters<typeof createCoreApi>[0],'sanitizePhoto'>;
/** Node host: business rules are shared with the Cloudflare runtime. */
export function createApi(options:ApiOptions){
  return createCoreApi({...options,sanitizePhoto,traffic:{redOnlyPng:trafficRedOnlyPng,...options.traffic}});
}
