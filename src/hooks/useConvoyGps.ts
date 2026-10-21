import { useEffect,useRef,useState } from 'react';
import { convoyService } from '../services/convoyService';
import { isNativeApp,TravelNative } from '../services/nativeApp';
import { useDeviceLocation } from './useDeviceLocation';
import { isFreshGpsFix } from '../services/gpsFreshness';
/** Lives at the app root so returning to another tab never stops consented sharing. */
export function useConvoyGps(accountId:string|undefined,enabled:boolean){
  const [version,setVersion]=useState(0),[error,setError]=useState(''),[nativeReady,setNativeReady]=useState(false);
  useEffect(()=>{const changed=()=>setVersion(v=>v+1);window.addEventListener('rdv:convoys-changed',changed);return()=>window.removeEventListener('rdv:convoys-changed',changed);},[]);
  const session=enabled?convoyService.getLocationSession():null, native=isNativeApp();
  const location=useDeviceLocation(!!session&&!native,session?.locationToken||'');
  const latest=useRef(location);latest.current=location;
  const lastStaleRestartAt=useRef(0);
  const nativeFixTimestamp=useRef<number|null>(null);
  useEffect(()=>{
    if(!enabled||!accountId)return;
    let disposed=false,busy=false,nativeStarted=false;
    nativeFixTimestamp.current=null;
    setError('');setNativeReady(false);
    const tick=async()=>{
      if(busy||disposed)return;busy=true;
      try{
        convoyService.expireLocations();await convoyService.retryRevocations();if(disposed)return;
        const current=convoyService.getLocationSession();if(!current)return;
        const convoy=await convoyService.getConvoy(current.convoyId);if(disposed)return;
        if(convoy.status!=='active'||convoy.ownLocationToken!==current.locationToken){
          if(native)await TravelNative.setConvoy({convoyId:current.convoyId,enabled:false});
          convoyService.dropLocationSession();setError('Compartilhamento encerrado ou assumido em outro aparelho.');return;
        }
        if(native){
          if(!nativeStarted){const previous=await TravelNative.state();if(previous.stoppedLocationToken===current.locationToken){await convoyService.stopSharing();setError('GPS interrompido. Ative o compartilhamento para retomar.');return;}await TravelNative.setConvoy({...current,enabled:true});nativeStarted=true;return;}
          const state=await TravelNative.state();if(disposed)return;
          if(state.convoyId!==current.convoyId){await convoyService.stopSharing();setError('GPS interrompido. Ative o compartilhamento para retomar.');return;}
          const timestamp=state.position?.timestamp??null;
          nativeFixTimestamp.current=timestamp;
          const fresh=isFreshGpsFix(timestamp);
          setNativeReady(fresh);
          setError(timestamp!==null&&!fresh?'O sinal do GPS está desatualizado. Aguardando nova posição.':'');
        }else{
          const gps=latest.current;
          if(gps.error){
            setError(gps.error);
            // Six seconds without a new fix is a warning, not a reason to
            // tear down a live watch every five seconds. An idle device may
            // legitimately report no movement. Retry only a long-stalled watch.
            if(gps.status==='stale'&&gps.position){
              const now=Date.now();
              if(now-gps.position.timestamp>=30_000&&now-lastStaleRestartAt.current>=30_000){
                lastStaleRestartAt.current=now;
                gps.retry();
              }
            }
            return;
          }
          if(gps.status==='ready')lastStaleRestartAt.current=0;
          if(gps.status==='ready'&&gps.position&&gps.position.accuracyMeters<=50&&isFreshGpsFix(gps.position.timestamp)){
            await convoyService.updateParticipantLocation(current.convoyId,accountId,gps.position.coords,gps.position.timestamp,gps.position.accuracyMeters);if(!disposed)setError('');
          }
        }
      }catch(e){if(disposed)return;const err=e as Error&{status?:number};setError(err.message);if(session&&[401,403,404,409].includes(err.status||0)){await convoyService.stopSharing();}}
      finally{busy=false;}
    };
    void tick();const timer=window.setInterval(()=>void tick(),5000);
    // The native bridge is read every five seconds, but the on-screen GPS
    // indicator must expire a six-second-old fix without waiting for polling.
    const freshnessTimer=native?window.setInterval(()=>{
      const timestamp=nativeFixTimestamp.current;
      if(timestamp!==null&&!isFreshGpsFix(timestamp)){
        setNativeReady(false);
        setError('O sinal do GPS está desatualizado. Aguardando nova posição.');
      }
    },1000):undefined;
    const resume=()=>{if(!document.hidden){latest.current.retry();void tick();}};
    window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
    return()=>{disposed=true;clearInterval(timer);if(freshnessTimer!==undefined)clearInterval(freshnessTimer);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);};
  },[accountId,enabled,session?.convoyId,session?.locationToken,native]);
  void version;
  return {session,error,ready:native?nativeReady:location.status==='ready',retry:location.retry};
}
