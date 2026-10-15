import React, { useEffect, useState } from 'react';
import { fuelApi } from '../../services/fuelApi';
import type { PageResult } from '../../types/admin';
import { ROAD_ALERT_TYPES, type RoadAlert } from '../../types/roadAlerts';
import { Pager, buttonClass, stamp } from './shared';

/** Somente o administrador publica um alerta. Relatos pendentes nunca vão ao mapa. */
export function RoadAlertsQueue({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [data, setData] = useState<PageResult<RoadAlert>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const load = (page = 1, filter = status) => fuelApi<PageResult<RoadAlert>>(`/admin/road-alerts?status=${filter}&page=${page}`).then(setData);
  useEffect(() => { setError(''); setMessage(''); load(1, status).catch(err => setError(err.message)); }, [status]);
  const review = async (id: string, action: 'approve' | 'reject' | 'revoke') => {
    setBusy(true); setError(''); setMessage('');
    try {
      await fuelApi(`/admin/road-alerts/${encodeURIComponent(id)}/review`, { method: 'POST', body: JSON.stringify({ action }) });
      await load(data.page);
      onChange();
      setMessage(action === 'approve' ? 'Ocorrência publicada até expirar.' : action === 'revoke' ? 'Alerta retirado do mapa.' : 'Ocorrência rejeitada.');
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="space-y-4">
    <h2 className="text-xl font-bold">Alertas de estrada</h2>
    <p className="text-xs text-slate-600">Verifique local e tipo antes de publicar. Veículos parados e obstáculos expiram rapidamente; radar e buraco também possuem prazo. Alertas não verificados nunca aparecem para viajantes.</p>
    <div className="flex gap-2 flex-wrap">
      {(['pending','approved','rejected'] as const).map(key => <button key={key} type="button" aria-pressed={status === key} className={`${buttonClass} ${status === key ? 'bg-slate-800 text-white' : ''}`} onClick={() => setStatus(key)}>{key === 'pending' ? 'Pendentes' : key === 'approved' ? 'Publicados' : 'Rejeitados'}</button>)}
    </div>
    {error && <p role="alert" className="text-rose-700 text-sm">{error}</p>}
    {message && <p role="status" className="text-emerald-700 text-sm">{message}</p>}
    {!data.items.length && <p className="text-sm text-slate-600">Nenhuma ocorrência nesta categoria.</p>}
    {data.items.map(alert => <article key={alert.id} className="bg-white border rounded-2xl p-4 space-y-2">
      <strong className="text-sm">{ROAD_ALERT_TYPES.find(t => t.id === alert.kind)?.label || alert.kind}</strong>
      <p className="text-xs text-slate-600">Enviado por {alert.submittedBy || 'Usuário'} · {stamp(alert.createdAt)} · Válido até {stamp(alert.expiresAt)}</p>
      {alert.note && <p className="text-sm whitespace-pre-wrap break-words">{alert.note}</p>}
      <p className="text-xs text-slate-600">GPS: {alert.lat.toFixed(5)}, {alert.lng.toFixed(5)} · <a className="underline text-blue-700" target="_blank" rel="noopener noreferrer" href={`https://www.openstreetmap.org/?mlat=${alert.lat}&mlon=${alert.lng}#map=17/${alert.lat}/${alert.lng}`}>Verificar no mapa</a></p>
      {status === 'pending' && <div className="flex gap-2"><button disabled={busy} className={`${buttonClass} text-emerald-700`} onClick={() => review(alert.id, 'approve')}>Aprovar</button><button disabled={busy} className={`${buttonClass} text-rose-700`} onClick={() => review(alert.id, 'reject')}>Rejeitar</button></div>}
      {status === 'approved' && <button disabled={busy} className={`${buttonClass} text-rose-700`} onClick={() => review(alert.id, 'revoke')}>Remover do mapa</button>}
    </article>)}
    <Pager result={data} onPage={page => load(page).catch(err => setError(err.message))} />
  </section>;
}
