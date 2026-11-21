import { useEffect, useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { ROAD_ALERT_TYPES, type RoadAlert } from '../types/roadAlerts';
import { roadAlertTitle } from '../services/roadAlertPresentation';
import { RadarAttribution } from './RadarAttribution';

interface Props {
  alert: RoadAlert;
  marker: HTMLElement | null;
  busy: boolean;
  error: string;
  message: string;
  onClose: () => void;
  onConfirm: (present: boolean) => void;
}

const GAP = 8;

export function MapRoadAlertDialog({ alert, marker, busy, error, message, onClose, onConfirm }: Props) {
  const anchor = alert.kind === 'speed_camera' ? marker : null;
  const panel = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const currentMarker = useRef<HTMLElement | null>(marker);

  useLayoutEffect(() => {
    const balloon = panel.current, body = content.current, pointer = tip.current;
    const frame = balloon?.parentElement;
    if (!anchor || !balloon || !body || !pointer || !frame) return;
    const selector = `[data-road-alert-id="${CSS.escape(alert.id)}"]`;
    currentMarker.current = anchor;
    let pending = 0;
    let lastLayout = '';
    const position = () => {
      // When the raster renderer upgrades its markers, follow the replacement
      // for the selected report instead of keeping the detached Leaflet node.
      const previous = currentMarker.current;
      const activeMarker = previous && frame.contains(previous) ? previous : frame.querySelector<HTMLElement>(selector);
      currentMarker.current = activeMarker;
      const pin = activeMarker?.getBoundingClientRect(), bounds = frame.getBoundingClientRect();
      if (!pin || pin.bottom < bounds.top || pin.top > bounds.bottom ||
          pin.right < bounds.left || pin.left > bounds.right) {
        balloon.style.visibility = 'hidden';
        lastLayout = '';
      } else {
        const center = pin.left + pin.width / 2 - bounds.left;
        const width = balloon.offsetWidth;
        const above = pin.top - bounds.top - 2 * GAP;
        const below = bounds.bottom - pin.bottom - 2 * GAP;
        const naturalHeight = body.scrollHeight;
        const onTop = above >= Math.min(naturalHeight, below);
        const maxHeight = Math.max(0, Math.floor(onTop ? above : below));
        const height = Math.min(naturalHeight, maxHeight);
        const left = Math.round(Math.max(GAP, Math.min(center - width / 2, bounds.width - width - GAP)));
        const top = Math.round(onTop ? pin.top - bounds.top - GAP - height : pin.bottom - bounds.top + GAP);
        const tipLeft = Math.round(Math.max(12, Math.min(width - 24, center - left - 6)));
        const layout = [left, top, maxHeight, tipLeft, onTop].join(',');
        if (layout !== lastLayout) {
          balloon.style.transform = `translate(${left}px, ${top}px)`;
          body.style.maxHeight = `${maxHeight}px`;
          pointer.style.left = `${tipLeft}px`;
          pointer.style.top = onTop ? '' : '-6px';
          pointer.style.bottom = onTop ? '-6px' : '';
          balloon.style.visibility = maxHeight > 0 ? 'visible' : 'hidden';
          lastLayout = layout;
        }
      }
      pending = requestAnimationFrame(position);
    };
    position();
    return () => {
      cancelAnimationFrame(pending);
      balloon.style.transform = '';
      balloon.style.visibility = '';
      body.style.maxHeight = '';
    };
  }, [anchor, alert.id]);

  useEffect(() => {
    if (!anchor) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) &&
          !currentMarker.current?.contains(event.target)) onClose();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape);
    };
  }, [anchor, onClose]);

  const imported = alert.source === 'pardal';
  return <section ref={panel} role="dialog" aria-label="Confirmar ocorrência no mapa"
    className={`absolute z-[70] rounded-2xl bg-white shadow-xl ${anchor
      ? 'left-0 top-0 w-[min(285px,calc(100%-16px))]'
      : 'left-1/2 top-[max(16px,env(safe-area-inset-top))] w-[min(330px,calc(100%-24px))] -translate-x-1/2'}`}
    style={anchor ? { visibility: 'hidden' } : undefined}>
    {anchor && <span ref={tip} aria-hidden="true" className="pointer-events-none absolute h-3 w-3 rotate-45 bg-white" />}
    <div ref={content} className="relative overflow-y-auto p-3">
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
    </div>
  </section>;
}
