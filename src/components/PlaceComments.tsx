import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fuelApi } from '../services/fuelApi';
import type { PageResult, PlaceComment } from '../types/admin';

export function PlaceComments({ placeId, title = 'Comentários do estabelecimento' }: { placeId: string; title?: string }) {
  const auth = useAuth();
  const [result, setResult] = useState<PageResult<PlaceComment>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [body, setBody] = useState(''), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = (page = 1) => fuelApi<PageResult<PlaceComment>>(`/places/${encodeURIComponent(placeId)}/comments?page=${page}`).then(setResult).catch(error => setError(error.message));
  useEffect(() => { load(); }, [placeId, auth.user?.id]);
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!auth.user) { auth.promptLogin(); return; }
    setBusy(true); setError('');
    try { const result = await fuelApi<{ message: string }>(`/places/${encodeURIComponent(placeId)}/comments`, { method: 'POST', body: JSON.stringify({ body }) }); setBody(''); setMessage(result.message); await load(); }
    catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  };
  const report = async (id: string) => {
    if (!auth.user) { auth.promptLogin(); return; }
    setBusy(true); setError('');
    try { await fuelApi(`/comments/${id}/report`, { method: 'POST', body: '{}' }); setMessage('Denúncia enviada para análise.'); }
    catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  };
  return <section className="border-t pt-4 space-y-3"><h3 className="font-bold">{title}</h3>
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}{message && <p role="status" className="text-xs text-emerald-700">{message}</p>}
    {result.items.map(comment => <article key={comment.id} className="bg-slate-50 rounded-xl p-3 text-xs space-y-1"><strong>{comment.displayName}</strong><p className="whitespace-pre-wrap break-words">{comment.body}</p><p className="text-slate-500">{new Date(comment.createdAt).toLocaleString('pt-BR')} · {comment.status === 'pending' ? 'Aguardando aprovação' : 'Publicado'}</p>{comment.status === 'published' && <button disabled={busy} onClick={() => report(comment.id)} className="text-slate-600 underline">Denunciar comentário</button>}</article>)}
    {!result.items.length && <p className="text-xs text-slate-500">Nenhum comentário publicado.</p>}
    {result.page > 1 && <button onClick={() => load(result.page - 1)} className="text-xs mr-3">Anterior</button>}{result.page * result.pageSize < result.total && <button onClick={() => load(result.page + 1)} className="text-xs">Próxima página</button>}
    <form onSubmit={send} className="space-y-2"><label className="block text-xs font-semibold">Seu comentário<textarea required maxLength={1000} value={body} onChange={e => setBody(e.target.value)} placeholder="Compartilhe sua experiência sem dados pessoais." className="block mt-1 w-full border rounded-xl p-3" /></label><button disabled={busy} className="text-xs font-bold text-emerald-700">Enviar comentário para análise</button></form>
  </section>;
}
