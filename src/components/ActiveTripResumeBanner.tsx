import { ArrowUpRight, Navigation, Route } from 'lucide-react';

interface ActiveTripResumeBannerProps {
  destination: string;
  ownsTracking: boolean;
  onResume: () => void;
  onOptions: () => void;
}

export function ActiveTripResumeBanner({destination, ownsTracking, onResume, onOptions}: ActiveTripResumeBannerProps) {
  return <aside aria-label="Viagem em andamento" className="rdv-trip-resume-banner shrink-0 px-3 pt-[max(10px,env(safe-area-inset-top,0px))] pb-2">
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
        <button type="button" onClick={onOptions}
          className="min-h-12 rounded-xl border border-white/45 bg-white/10 text-white font-bold text-[13px] flex items-center justify-center gap-1.5 px-4 active:scale-[.98] transition-transform">
          Mapa <ArrowUpRight size={17}/>
        </button>
      </div>
    </div>
  </aside>;
}
