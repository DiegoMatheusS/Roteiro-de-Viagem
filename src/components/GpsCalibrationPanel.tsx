import {useCallback,useEffect,useRef,useState} from 'react';
import {calibrateDeviceGps,type GpsCalibrationResult} from '../services/gpsCalibration';
import {useGpsPermissionAction} from '../hooks/useGpsPermissionAction';

export function GpsCalibrationPanel(){
  const controller=useRef<AbortController|null>(null),mounted=useRef(true);
  const [result,setResult]=useState<GpsCalibrationResult|null>(null);
  const [progress,setProgress]=useState<{accuracy:number;samples:number}|null>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
  const acquire=useCallback(async()=>{
    const current=controller.current;
    if(!mounted.current||!current||current.signal.aborted)throw new Error('Calibração cancelada.');
    const calibrated=await calibrateDeviceGps({signal:current.signal,
      onProgress:(accuracy,samples)=>{if(mounted.current)setProgress({accuracy,samples});}});
    if(mounted.current&&!current.signal.aborted)setResult(calibrated);
  },[]);
  const access=useGpsPermissionAction(()=>{},acquire);
  const start=()=>{
    if(access.requesting)return;
    controller.current?.abort();controller.current=new AbortController();
    setResult(null);setProgress(null);void access.request();
  };
  return <section aria-label="Precisão do GPS" className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3 text-sm">
    <h3 className="font-bold text-slate-900">Precisão do GPS</h3>
    <p className="text-xs text-slate-600">Em um local aberto, aguarde até 12 segundos para conferir a precisão e a estabilidade do sinal.</p>
    {access.requesting&&<p role="status" className="text-xs text-blue-700">{progress
      ?`Precisão observada: ±${Math.ceil(progress.accuracy)} m · ${progress.samples} leitura(s) válida(s)`
      :'Buscando sinal GPS preciso...'}</p>}
    {result&&!access.requesting&&<p role="status" className={`text-xs ${result.quality==='stable'?'text-emerald-700':'text-amber-800'}`}>
      {result.quality==='stable'?'Sinal estável':'Precisão limitada'} · ±{Math.ceil(result.position.accuracyMeters)} m · {result.samples} leitura(s) válida(s).
      {result.quality==='limited'&&' Tente novamente em um local mais aberto.'}
    </p>}
    {access.help&&<p role="alert" className="text-xs text-amber-800">{access.help}</p>}
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={access.requesting} onClick={start}
        className="min-h-11 px-4 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50">{access.requesting?'Verificando GPS...':'Calibrar GPS'}</button>
      {access.requesting&&<button type="button" onClick={()=>controller.current?.abort()} className="min-h-11 px-3 underline">Cancelar calibração</button>}
    </div>
  </section>;
}
