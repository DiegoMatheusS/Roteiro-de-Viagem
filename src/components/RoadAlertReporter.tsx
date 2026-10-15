import React, { useState } from 'react';
import { AlertTriangle, Camera, CarFront, Construction, MapPin, X } from 'lucide-react';
import { ROAD_ALERT_TYPES, type RoadAlertType } from '../types/roadAlerts';
import type { DeviceLocation } from '../services/locationService';
import { getCurrentDeviceLocation } from '../services/locationService';
import { submitRoadAlert } from '../hooks/useRoadAlerts';

const alertIcons: Record<RoadAlertType, React.ElementType> = {
  pothole: AlertTriangle,
  broken_vehicle: CarFront,
  speed_camera: Camera,
  road_obstruction: Construction
};
export function RoadAlertReporter({
  location, speedKmH, onSubmitted
}: { location: DeviceLocation | null; speedKmH: number | null; onSubmitted: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
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
      setStopped(false); setNote(''); onSubmitted();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  const selected = ROAD_ALERT_TYPES.find(type => type.id === kind);
  return <>
    <div className="relative">
      {menuOpen && <div role="menu" aria-label="Escolher ocorrência" className="absolute bottom-[calc(100%+8px)] right-0 flex flex-col gap-2 w-48">
        {ROAD_ALERT_TYPES.map(item => {
          const Icon = alertIcons[item.id];
          return <button role="menuitem" key={item.id} type="button" onClick={() => {setKind(item.id);setOpen(true);setMenuOpen(false);setError('');setMessage('');}}
            className="bg-white shadow-lg border border-slate-200 rounded-full px-3 py-2.5 flex items-center gap-3 text-slate-800 text-xs font-bold text-left min-h-11">
            <Icon size={19} className="text-blue-700 shrink-0"/><span>{item.label}</span>
          </button>;
        })}
        <button role="menuitem" type="button" onClick={() => {setMenuOpen(false);setTollInfo(true);}}
          className="bg-white shadow-lg border border-slate-200 rounded-full px-3 py-2.5 flex items-center gap-3 text-slate-800 text-xs font-bold text-left min-h-11">
          <MapPin size={19} className="text-emerald-700 shrink-0"/><span>Pedágio</span>
        </button>
      </div>}
      <button type="button" aria-label="Reportar problema na estrada" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}
        className="w-12 h-12 rounded-full bg-blue-600 text-white border-2 border-white flex items-center justify-center shadow-xl">
        {menuOpen ? <X size={24}/> : <AlertTriangle size={24}/>}
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
