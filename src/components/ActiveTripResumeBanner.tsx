import {useState} from 'react';
import {Navigation,PowerOff,Route} from 'lucide-react';

interface ActiveTripResumeBannerProps {
  destination:string;
  ownsTracking:boolean;
  onResume:()=>void;
  onEnd:()=>void;
}

export function ActiveTripResumeBanner({destination,ownsTracking,onResume,onEnd}:ActiveTripResumeBannerProps) {
  const [confirmEnd,setConfirmEnd]=useState(false);
  return <>
    <aside aria-label="Viagem em andamento" className="rdv-trip-resume-banner shrink-0 px-3 pt-[max(10px,env(safe-area-inset-top,0px))] pb-2">
      <div className="mx-auto w-full max-w-2xl rounded-[22px] bg-emerald-800 text-white shadow-[0_8px_28px_#064e3b45] border border-emerald-600/70 px-4 py-3.5">
        <div className="flex items-center gap-3 mb-3">
          <span className="grid place-items-center w-11 h-11 rounded-2xl bg-white/15 shrink-0"><Route size={25} strokeWidth={2.5}/></span>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-extrabold leading-tight">Viagem em andamento</p>
            <p className="text-[13px] text-emerald-100 truncate mt-1">{destination}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onResume}
            className="flex-1 min-w-0 min-h-12 rounded-xl bg-white text-emerald-900 font-extrabold text-[13px] flex items-center justify-center gap-2 px-3 active:scale-[.98] transition-transform">
            <Navigation size={18} className="shrink-0"/>{ownsTracking?'Retomar navegação':'Assumir navegação'}
          </button>
          <button type="button" onClick={()=>setConfirmEnd(true)} aria-label="Encerrar viagem"
            className="min-h-12 rounded-xl border border-red-200/50 bg-red-700 text-white font-bold text-[13px] flex items-center justify-center gap-1.5 px-4 active:scale-[.98] transition-transform">
            <PowerOff size={16}/>Encerrar
          </button>
        </div>
      </div>
    </aside>
    {confirmEnd&&<div role="dialog" aria-modal="true" aria-label="Confirmar encerramento da viagem"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-5">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-slate-900 shadow-2xl">
        <h2 className="text-lg font-bold">Encerrar viagem?</h2>
        <p className="mt-2 text-sm text-slate-600">A navegação até {destination} será encerrada. Você poderá consultar o histórico depois.</p>
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={()=>setConfirmEnd(false)}
            className="flex-1 min-h-12 rounded-xl border border-slate-300 font-semibold">Manter viagem</button>
          <button type="button" onClick={()=>{setConfirmEnd(false);onEnd();}}
            className="flex-1 min-h-12 rounded-xl bg-red-700 text-white font-bold">Sim, encerrar</button>
        </div>
      </div>
    </div>}
  </>;
}
