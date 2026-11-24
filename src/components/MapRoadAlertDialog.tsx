import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ROAD_ALERT_TYPES, type RoadAlert } from '../types/roadAlerts';
import { roadAlertTitle } from '../services/roadAlertPresentation';
import type { MarkerPopupAnchor } from '../services/mapMarkerPopup';
import { RadarAttribution } from './RadarAttribution';
import '../role-place-balloon.css';

interface Props {
  alert: RoadAlert;
  marker: MarkerPopupAnchor | null;
  busy: boolean;
  error: string;
  message: string;
  onClose: () => void;
  onConfirm: (present: boolean) => void;
}

export function MapRoadAlertDialog({ alert, marker, busy, error, message, onClose, onConfirm }: Props) {
  const anchor = alert.kind === 'speed_camera' ? marker : null;
  const content = useMemo(()=>anchor ? document.createElement('div') : null,[anchor]);
  const close = useRef(onClose);
  close.current = onClose;

  useLayoutEffect(() => {
    if (!anchor || !content) return;
    return anchor.mount(content,()=>close.current());
  }, [anchor, content]);

  useEffect(() => {
    if (!anchor || !content) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close.current(); };
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('keydown', escape);
    };
  }, [anchor, content]);

  const imported = alert.source === 'pardal';
  const dialog = <section role="dialog" aria-label="Confirmar ocorrência no mapa"
    className={anchor
      ? 'w-[min(285px,calc(100vw-32px))] max-h-[min(250px,55dvh)] overflow-y-auto rounded-2xl bg-white p-3'
      : 'absolute left-1/2 top-[max(16px,env(safe-area-inset-top))] z-[70] w-[min(330px,calc(100%-24px))] -translate-x-1/2 rounded-2xl bg-white p-3 shadow-xl'}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-amber-700">
            {imported ? 'Radar cadastrado' : ROAD_ALERT_TYPES.find(type => type.id === alert.kind)?.label}
          </p>
          <h3 className="text-[15px] font-bold text-slate-900">{imported ? roadAlertTitle(alert) : 'Ainda continua lá?'}</h3>
        </div>
        <button type="button" aria-label="Fechar confirmação de ocorrência" onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100">
          <X size={18}/>
        </button>
      </div>
      {!imported && alert.note && <p className="mt-2 line-clamp-2 text-xs text-slate-600">{alert.note}</p>}
      <RadarAttribution alert={alert}/>
      {!imported && !message && <p className="mt-2 text-xs text-slate-500">Confirme somente se estiver perto do local e com o veículo parado.</p>}
      {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
      {message && <p role="status" className="mt-2 text-xs text-emerald-700">{message}</p>}
      {!imported && !message && <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => onConfirm(true)} className="min-h-11 rounded-xl bg-blue-600 text-sm font-bold text-white disabled:opacity-50">Sim</button>
        <button type="button" disabled={busy} onClick={() => onConfirm(false)} className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-800 disabled:opacity-50">Não</button>
      </div>}
  </section>;
  return content ? createPortal(dialog,content) : dialog;
}
