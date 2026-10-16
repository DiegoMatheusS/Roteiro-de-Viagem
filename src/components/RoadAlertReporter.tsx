import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, CarFront, Construction, MapPin, Shield, ShieldAlert, Waves, X } from 'lucide-react';
import { ROAD_ALERT_TYPES, type RoadAlertType } from '../types/roadAlerts';
import type { DeviceLocation } from '../services/locationService';
import { getCurrentDeviceLocation } from '../services/locationService';
import { submitRoadAlert } from '../hooks/useRoadAlerts';

const alertIcons: Record<RoadAlertType, React.ElementType> = {
  pothole: AlertTriangle,
  broken_vehicle: CarFront,
  speed_camera: Camera,
  road_obstruction: Construction,
  flooded_road: Waves,
  police_presence: Shield,
  robbery: ShieldAlert
};
export function RoadAlertReporter({
  location, speedKmH, onSubmitted, menuPlacement = 'above'
}: { location: DeviceLocation | null; speedKmH: number | null; onSubmitted?: () => void; menuPlacement?: 'above' | 'below' }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [menuOpen]);
  const [open, setOpen] = useState(false);
  const [tollInfo, setTollInfo] = useState(false);
  const [kind, setKind] = useState<RoadAlertType>('pothole');
  const [note, setNote] = useState(''), [stopped, setStopped] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const moving = speedKmH != null && speedKmH > 5;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage(''); setError('');
    if (!stopped || moving) { setError('Pare em um local seguro para informar uma ocorrência.'); return; }
    setBusy(true);
    try {
      const fresh = await getCurrentDeviceLocation();
      if (fresh.speedMetersPerSecond != null && fresh.speedMetersPerSecond * 3.6 > 5)
        throw new Error('Você está em movimento. Pare em segurança antes de enviar.');
      await submitRoadAlert(kind, fresh, note);
      setMessage('Enviado para análise. O alerta só aparece após aprovação.');
      setStopped(false); setNote(''); onSubmitted?.();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  const selected = ROAD_ALERT_TYPES.find(type => type.id === kind);
  return <>
    <div className="relative" ref={menuRef}>
      {menuOpen && <div role="menu" aria-label="Escolher ocorrência" data-testid="road-alert-balloon"
        className={`rdv-alert-popover absolute ${menuPlacement === 'above' ? 'bottom-0 origin-bottom-right' : 'top-0 origin-top-right'} right-[calc(100%+12px)] z-50 w-[min(288px,calc(100vw-82px))] rounded-[22px] border border-slate-200 bg-white/95 backdrop-blur-lg p-3 shadow-[0_12px_34px_rgba(15,23,42,.18)]`}>
        <span aria-hidden="true" className={`absolute -right-[6px] ${menuPlacement === 'above' ? 'bottom-4' : 'top-4'} h-3 w-3 rotate-45 border-r border-t border-slate-200 bg-white`}/>
        <div className="relative grid grid-cols-4 gap-2">
          {ROAD_ALERT_TYPES.map(item => {
            const Icon = alertIcons[item.id];
            return <button role="menuitem" key={item.id} type="button" aria-label={item.label} title={item.label}
              onClick={() => {setKind(item.id);setOpen(true);setMenuOpen(false);setError('');setMessage('');}}
              className="flex aspect-square min-h-12 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-blue-700 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 active:scale-95">
              <Icon size={23} strokeWidth={2} aria-hidden="true"/>
            </button>;
          })}
          <button role="menuitem" type="button" aria-label="Pedágio" title="Pedágio"
            onClick={() => {setMenuOpen(false);setTollInfo(true);}}
            className="flex aspect-square min-h-12 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-emerald-700 shadow-sm transition-colors hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 active:scale-95">
            <MapPin size={23} strokeWidth={2} aria-hidden="true"/>
          </button>
        </div>
      </div>}
      <button type="button" aria-label="Reportar problema na estrada" aria-expanded={menuOpen} aria-haspopup="true" onClick={() => setMenuOpen(value => !value)}
        className="w-12 h-12 rounded-full bg-white text-amber-700 border border-amber-200 flex items-center justify-center shadow-[0_4px_18px_rgba(15,23,42,.16)] active:scale-95 transition-transform">
        {menuOpen ? <X size={23}/> : <AlertTriangle size={25} strokeWidth={2.3}/>}
      </button>
    </div>
    {tollInfo && <div className="fixed inset-0 z-[100] bg-black/65 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Contribuir com pedágio">
      <section className="w-full max-w-md rounded-t-3xl bg-white p-5 space-y-3"><div className="flex justify-between"><h3 className="font-bold text-lg">Informar pedágio</h3><button onClick={()=>setTollInfo(false)} aria-label="Fechar"><X/></button></div>
        <p className="text-sm text-slate-600">Para indicar ou atualizar a tarifa, toque no marcador do pedágio no mapa e escolha a opção de contribuição. As informações passam pela aprovação do administrador.</p>
        <button className="rounded-xl p-3 bg-blue-600 text-white font-bold w-full" onClick={()=>setTollInfo(false)}>Voltar ao mapa</button>
      </section>
    </div>}
    {open && <div className="fixed inset-0 z-[100] bg-black/65 flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Reportar ocorrência na via">
      <form className="bg-white rounded-3xl w-full max-w-md p-5 space-y-4 text-slate-900 max-h-[90dvh] overflow-y-auto" onSubmit={submit}>
        <div className="flex justify-between gap-4 items-center"><h3 className="text-lg font-bold">{selected?.label || 'Informar ocorrência'}</h3><button type="button" aria-label="Fechar ocorrência" onClick={() => setOpen(false)}><X/></button></div>
        <p className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">Não use o celular dirigindo. Pare em segurança. O relato somente aparecerá no mapa depois da aprovação.</p>
        <label className="text-sm block font-semibold">Detalhes (opcional)<textarea maxLength={200} rows={2} className="mt-2 w-full border rounded-xl p-3 text-sm font-normal" value={note} onChange={event => setNote(event.target.value)} placeholder="Ex.: Faixa da direita, sentido centro"/></label>
        <label className="flex gap-2 items-start text-sm"><input type="checkbox" checked={stopped} onChange={event => setStopped(event.target.checked)} className="mt-1"/> Estou parado em local seguro e confirmo que vi esta ocorrência.</label>
        {!location && <p className="text-sm text-amber-800">GPS indisponível. Ative a localização precisa.</p>}
        {moving && <p role="alert" className="text-sm text-rose-700">Veículo em movimento. Envio bloqueado.</p>}
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
        <button type="submit" className="w-full rounded-xl p-3 bg-blue-700 text-white font-semibold disabled:opacity-50" disabled={busy || moving || !stopped || !location}>{busy ? 'Enviando...' : 'Enviar para análise'}</button>
      </form>
    </div>}
  </>;
}
