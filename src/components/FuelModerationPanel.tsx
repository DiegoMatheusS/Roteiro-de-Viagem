import React, { useEffect, useState } from 'react';
import { fuelApi } from '../services/fuelApi';
import { FUEL_OPTIONS } from '../types/fuel';

export function FuelModerationPanel({ onClose }: { onClose: () => void }) {
  const [queue, setQueue] = useState<{ photos: any[]; prices: any[]; reports: any[] }>({ photos: [], prices: [], reports: [] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState('');
  const refresh = () => fuelApi<typeof queue>('/moderation').then(setQueue).catch(error => setError(error.message));
  useEffect(() => { refresh(); }, []);
  const action = async (type: string, id: string, value: string) => {
    setBusy(true); setError('');
    try { await fuelApi(`/moderation/${type}/${id}`, { method: 'POST', body: JSON.stringify({ action: value, notes }) }); await refresh(); setNotes(''); }
    catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-80 bg-slate-900/60 p-4 flex justify-center items-center" role="dialog" aria-modal="true" aria-label="Moderação de combustíveis"><section className="bg-white rounded-3xl p-5 w-full max-w-2xl max-h-[92dvh] overflow-auto space-y-4">
    <div className="flex justify-between"><h2 className="font-bold">Moderação de preços e fotos</h2><button onClick={onClose} aria-label="Fechar moderação">✕</button></div>
    <p className="text-xs text-slate-600">Aprove fotos apenas se mostrarem preços legíveis, sem rostos, placas, telefones pessoais ou outros dados pessoais.</p>
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    <label className="block text-xs font-semibold">Nota da revisão<input maxLength={300} value={notes} onChange={e => setNotes(e.target.value)} className="w-full border p-2 rounded-xl mt-1" /></label>
    {queue.photos.map(photo => <article key={photo.id} className="border rounded-xl p-3 space-y-2"><strong className="text-sm">{photo.stationName}</strong><img src={`/api/photos/${photo.id}`} alt="Foto pendente de revisão" className="max-h-60 object-contain rounded-xl" /><div className="flex gap-4 text-xs"><button disabled={busy} onClick={() => action('photos', photo.id, 'approve')} className="font-bold text-emerald-700">Aprovar foto</button><button disabled={busy} onClick={() => action('photos', photo.id, 'reject')} className="font-bold text-rose-700">Rejeitar foto</button></div></article>)}
    {queue.prices.map(price => <article key={price.id} className="border rounded-xl p-3 space-y-2"><p className="text-sm"><strong>{price.stationName}</strong> · {FUEL_OPTIONS.find(f => f.id === price.fuel_type)?.label} · R$ {price.price.toFixed(3)} · {new Date(price.observed_at).toLocaleString('pt-BR')}</p>{price.photo_id && <img src={`/api/photos/${price.photo_id}`} alt="Comprovante do preço" className="max-h-48 rounded-xl object-contain" />}<div className="flex gap-4 text-xs"><button disabled={busy} onClick={() => action('prices', price.id, 'approve')} className="font-bold text-emerald-700">Aprovar preço</button><button disabled={busy} onClick={() => action('prices', price.id, 'reject')} className="font-bold text-rose-700">Rejeitar preço</button></div></article>)}
    {queue.reports.map(report => <article key={report.id} className="border border-rose-200 rounded-xl p-3 space-y-2 text-xs"><strong>Denúncia: {report.reason.replaceAll('_', ' ')}</strong><p>{report.stationName} {report.price ? `· ${FUEL_OPTIONS.find(f => f.id === report.fuelType)?.label} · R$ ${report.price.toFixed(3)}` : ''}</p><p>{report.details}</p>{report.target_type === 'photos' && <img src={`/api/photos/${report.target_id}`} alt="Foto denunciada" className="max-h-48 rounded-xl object-contain" />}<div className="flex gap-3"><button disabled={busy} onClick={() => action(report.target_type, report.target_id, 'reject')} className="text-rose-700 font-bold">Rejeitar contribuição</button><button disabled={busy} onClick={() => action('reports', report.id, 'resolve')} className="text-slate-700 font-bold">Marcar denúncia como revisada</button></div></article>)}
    {!queue.photos.length && !queue.prices.length && !queue.reports.length && <p className="text-sm text-slate-500">Nenhum item aguardando revisão.</p>}
  </section></div>;
}
