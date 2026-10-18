import {ApiError} from './http';

/** Bounded per-process limiter: don't retain unbounded arbitrary client keys. */
export function createRateLimiter(maxEntries=10000, clock:()=>number=Date.now) {
  const attempts = new Map<string,{count:number;reset:number}>();
  return (key:string,max:number,windowMs:number):void => {
    const now=clock(),entry=attempts.get(key);
    if(entry && entry.reset>now) {
      if(++entry.count>max)throw new ApiError('Muitas tentativas. Aguarde alguns minutos e tente novamente.',429);
      return;
    }
    if(!entry && attempts.size>=maxEntries){
      for(const [id,item] of attempts)if(item.reset<=now)attempts.delete(id);
      // Do not give active attackers a new quota by evicting active counters.
      if(attempts.size>=maxEntries)throw new ApiError('Muitas tentativas. Aguarde alguns minutos e tente novamente.',429);
    }
    attempts.set(key,{count:1,reset:now+windowMs});
  };
}
