import {watchDeviceLocation,type DeviceLocation} from './locationService';
import {isFreshGpsFix} from './gpsFreshness';
import {distanceBetweenKm} from './gpsTracking';

type Watch=(position:(fix:DeviceLocation)=>void,error:(message:string)=>void)=>()=>void;
export interface GpsCalibrationResult {position:DeviceLocation;quality:'stable'|'limited';samples:number}
export interface GpsCalibrationOptions {
  signal?:AbortSignal;
  onProgress?:(accuracyMeters:number,samples:number)=>void;
  watch?:Watch;
  doc?:Pick<Document,'hidden'|'addEventListener'|'removeEventListener'>;
}

/** Observe real fixes for at most 12 seconds. Nothing runs after completion,
 * cancellation, hiding the app or leaving the calibration screen. */
export function calibrateDeviceGps(options:GpsCalibrationOptions={}):Promise<GpsCalibrationResult> {
  const {signal,onProgress,doc=globalThis.document}=options;
  const page=globalThis.window;
  const watch=options.watch??((position,error)=>watchDeviceLocation(navigator.geolocation,position,error));
  return new Promise((resolve,reject)=>{
    let finished=false,stop=()=>{},previous:DeviceLocation|null=null,samples=0;
    const readings:DeviceLocation[]=[];
    const cancel=()=>finish(new Error('Calibração cancelada.'));
    const hidden=()=>{if(doc?.hidden)finish(new Error('Calibração interrompida ao sair da tela. Tente novamente ao voltar.'));};
    const finish=(error:Error|null,result?:GpsCalibrationResult)=>{
      if(finished)return;finished=true;
      clearTimeout(timer);signal?.removeEventListener('abort',cancel);doc?.removeEventListener('visibilitychange',hidden);
      page?.removeEventListener('pagehide',cancel);
      stop();
      if(error)reject(error);else resolve(result!);
    };
    const timer=setTimeout(()=>{
      const best=readings.filter(fix=>isFreshGpsFix(fix.timestamp)).sort((a,b)=>a.accuracyMeters-b.accuracyMeters||b.timestamp-a.timestamp)[0];
      if(best)finish(null,{position:best,quality:'limited',samples});
      else finish(new Error('Não foi possível obter GPS recente com precisão de até 50 m. Tente em um local aberto.'));
    },12000);
    signal?.addEventListener('abort',cancel,{once:true});doc?.addEventListener('visibilitychange',hidden);
    page?.addEventListener('pagehide',cancel);
    if(signal?.aborted){cancel();return;}
    if(doc?.hidden){hidden();return;}
    try{
      stop=watch(fix=>{
        if(finished||!isFreshGpsFix(fix.timestamp)||!Number.isFinite(fix.accuracyMeters)||fix.accuracyMeters<0)return;
        if(readings.some(reading=>reading.timestamp===fix.timestamp))return;
        if(fix.accuracyMeters>50){previous=null;onProgress?.(fix.accuracyMeters,samples);return;}
        readings.push(fix);samples++;onProgress?.(fix.accuracyMeters,samples);
        // Repeated cached callbacks do not confirm stability. Two recent,
        // consistent fixes must each report an uncertainty of at most 20 m.
        if(previous&&fix.timestamp>previous.timestamp&&isFreshGpsFix(previous.timestamp)&&
          previous.accuracyMeters<=20&&fix.accuracyMeters<=20&&
          distanceBetweenKm(previous.coords,fix.coords)*1000<=Math.max(10,previous.accuracyMeters+fix.accuracyMeters)){
          finish(null,{position:fix,quality:'stable',samples});return;
        }
        previous=fix;
      },message=>finish(new Error(message)));
      // A test/provider may synchronously deliver before returning its disposer.
      if(finished)stop();
    }catch(error){finish(error instanceof Error?error:new Error('Não foi possível verificar o GPS.'));}
  });
}
