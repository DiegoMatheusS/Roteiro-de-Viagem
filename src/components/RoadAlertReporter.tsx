import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { ROAD_ALERT_TYPES, type RoadAlertType } from '../types/roadAlerts';
import type { DeviceLocation } from '../services/locationService';
import { getCurrentDeviceLocation } from '../services/locationService';
import { submitRoadAlert } from '../hooks/useRoadAlerts';

export function RoadAlertReporter({
  location, speedKmH, onSubmitted
}: { location: DeviceLocation | null; speedKmH: number | null; onSubmitted: () => void }) {
  const [open, setOpen] = useState(false), [kind, setKind] = useState<RoadAlertType>('pothole');
  const [note, setNote] = useState(''), [stopped, setStopped] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const moving = speedKmH != null && speedKmH > 5;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage(''); setError('');
    if (!stopped || moving) { setError('Pare em um local seguro para informar uma ocorrência.'); return; }
    setBusy(true);
    try {
      // Reobtém posição precisa para não enviar uma posição antiga do rastreador.
      const fresh = await getCurrentDeviceLocation();
      if (fresh.speedMetersPerSecond != null && fresh.speedMetersPerSecond * 3.6 > 5)
        throw new Error('Você está em movimento. Pare em segurança antes de enviar.');
      await submitRoadAlert(kind, fresh, note);
      setMessage('Enviado para análise. O alerta só será exibido após aprovação.');
      setStopped(false); setNote(''); onSubmitted();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <>
    <button type="button" aria-label="Reportar problema na estrada" className="px-3 py-2 rounded-xl bg-white border border-amber-300 shadow-lg text-xs font-bold text-amber-900 flex gap-1 items-center" onClick={() => { setOpen(true); setError(''); }}>
      <AlertTriangle size={16} /> <span>Alertar</span>
    </button>
    {open && <div className="fixed inset-0 z-[100] bg-black/70 flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Reportar ocorrência na via">
      <form className="bg-white rounded-3xl w-full max-w-md p-5 space-y-4 text-slate-900 max-h-[90dvh] overflow-y-auto" onSubmit={submit}>
        <div className="flex justify-between gap-4 items-center"><h3 className="text-lg font-bold">Informar ocorrência</h3><button type="button" aria-label="Fechar ocorrência" onClick={() => setOpen(false)}><X /></button></div>
        <p className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">Não use o celular dirigindo. Pare em um local seguro antes de registrar o alerta. O registro será moderado antes de aparecer no mapa.</p>
        <div className="grid grid-cols-2 gap-2">{ROAD_ALERT_TYPES.map(item => <button type="button" key={item.id} onClick={() => setKind(item.id)} aria-pressed={kind === item.id} className={`p-3 text-left text-xs border rounded-xl ${kind === item.id ? 'bg-blue-50 border-blue-700 font-bold' : 'bg-white'}`}>{item.icon} {item.label}</button>)}</div>
        <label className="text-sm block font-semibold">Detalhes (opcional)<textarea maxLength={200} rows={2} className="mt-2 w-full border rounded-xl p-3 text-sm font-normal" value={note} onChange={event => setNote(event.target.value)} placeholder="Ex.: Faixa da direita, sentido centro" /></label>
        <label className="flex gap-2 items-start text-sm"><input type="checkbox" checked={stopped} onChange={event => setStopped(event.target.checked)} className="mt-1" /> Estou parado em local seguro e confirmo que vi esta ocorrência.</label>
        {!location && <p className="text-sm text-amber-800">GPS indisponível. Ative a localização precisa para informar.</p>}
        {moving && <p role="alert" className="text-sm text-rose-700">O veículo está em movimento. O envio está bloqueado.</p>}
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
        <button type="submit" className="w-full rounded-xl p-3 bg-blue-700 text-white font-semibold disabled:opacity-50" disabled={busy || moving || !stopped || !location}>{busy ? 'Enviando...' : 'Enviar para análise'}</button>
      </form>
    </div>}
  </>;
}
