import React, { useEffect, useState } from 'react';
import { fuelApi } from '../../services/fuelApi';
import { useAuth } from '../../contexts/AuthContext';
import type { AdminUser, PageResult, PlaceComment } from '../../types/admin';
import { Pager, ConfirmAction, buttonClass, inputClass, stamp } from './shared';

export function UsersManager({ onChange }: { onChange: () => void }) {
  const auth = useAuth();
  const [result, setResult] = useState<PageResult<AdminUser>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [q, setQ] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [remove, setRemove] = useState<AdminUser | null>(null);
  const load = (page = 1) => fuelApi<PageResult<AdminUser>>(`/admin/users?page=${page}&q=${encodeURIComponent(q)}`).then(setResult);
  useEffect(() => { load().catch(error => setError(error.message)); }, []);
  const act = async (account: AdminUser, action: string) => {
    setBusy(true); setError('');
    try { await fuelApi(`/admin/users/${account.id}`, { method: 'POST', body: JSON.stringify({ action, confirmed: action === 'delete' }) }); await load(result.page); onChange(); setMessage(action === 'delete' ? 'Conta excluída; sessões, fotos e comentários removidos.' : action === 'block' ? 'Conta bloqueada e sessões encerradas.' : 'Conta desbloqueada.'); }
    catch (error) { setError((error as Error).message); throw error; } finally { setBusy(false); }
  };
  return <div className="space-y-5"><h2 className="text-xl font-bold">Usuários</h2>{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}{message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
    <form className="flex gap-3" onSubmit={event => { event.preventDefault(); load().catch(error => setError(error.message)); }}><input aria-label="Buscar usuários" maxLength={100} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar nome ou e-mail" className={inputClass} /><button className={buttonClass}>Buscar</button></form>
    <div className="bg-white rounded-2xl border overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-4">Usuário</th><th className="p-4">Cadastro</th><th className="p-4">Estado</th><th className="p-4">Ações</th></tr></thead><tbody>{result.items.map(account => <tr key={account.id} className="border-t"><td className="p-4"><strong>{account.displayName}</strong><p className="text-xs text-slate-500">{account.email}</p>{account.role === 'admin' && <span className="text-xs text-emerald-700">Administrador</span>}</td><td className="p-4 whitespace-nowrap">{stamp(account.createdAt)}</td><td className="p-4">{account.blockedAt ? 'Bloqueado' : 'Ativo'}</td><td className="p-4 whitespace-nowrap">{account.id !== auth.user?.id && <><button disabled={busy} onClick={() => act(account, account.blockedAt ? 'unblock' : 'block').catch(() => {})} className="text-amber-800 mr-4">{account.blockedAt ? 'Desbloquear' : 'Bloquear'}</button><button disabled={busy} onClick={() => setRemove(account)} className="text-rose-700">Excluir usuário</button></>}</td></tr>)}</tbody></table>{!result.items.length && <p className="p-4 text-sm text-slate-500">Nenhum usuário encontrado.</p>}</div><Pager result={result} onPage={page => load(page).catch(error => setError(error.message))} />
    {remove && <ConfirmAction title="Excluir usuário" description={`Excluir a conta de ${remove.displayName}? O acesso, as fotos e os comentários serão removidos. Preços já aprovados permanecerão no histórico sem identificação pessoal.`} onClose={() => setRemove(null)} action={() => act(remove, 'delete')} />}
  </div>;
}
export function ReviewManager({ section, onChange }: { section: 'comments' | 'reports' | 'audit'; onChange: () => void }) {
  const [result, setResult] = useState<PageResult<any>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [remove, setRemove] = useState<PlaceComment | null>(null);
  const load = (page = 1) => fuelApi<PageResult<any>>(`/admin/${section}?page=${page}`).then(setResult);
  useEffect(() => { setMessage(''); setError(''); load().catch(error => setError(error.message)); }, [section]);
  const act = async (type: string, id: string, action: string) => {
    setBusy(true); setError('');
    try { await fuelApi(`/admin/review/${type}/${id}`, { method: 'POST', body: JSON.stringify({ action }) }); await load(result.page); onChange(); setMessage('Revisão registrada.'); }
    catch (error) { setError((error as Error).message); throw error; } finally { setBusy(false); }
  };
  const titles = { comments: 'Comentários', reports: 'Denúncias', audit: 'Histórico de ações' };
  const labels: Record<string, string> = { create: 'Cadastro', update: 'Atualização', delete: 'Exclusão', block: 'Bloqueio', unblock: 'Desbloqueio', approve: 'Aprovação', reject: 'Rejeição', resolve: 'Denúncia resolvida', request_new: 'Nova foto solicitada', approve_and_publish: 'Aprovação e publicação', correct_and_publish: 'Correção de preço', verify_hours: 'Verificação de horário' };
  return <div className="space-y-4"><h2 className="text-xl font-bold">{titles[section]}</h2>{error && <p role="alert" className="text-rose-700 text-sm">{error}</p>}{message && <p role="status" className="text-emerald-700 text-sm">{message}</p>}
    {result.items.map(item => <article key={item.id} className="bg-white rounded-2xl border p-5 space-y-2 text-sm">
      {section === 'comments' && <><strong>{item.placeName}</strong><p className="text-xs text-slate-500">{item.displayName} · {stamp(item.createdAt)} · {item.status === 'pending' ? 'Pendente' : 'Publicado'}</p><p className="whitespace-pre-wrap break-words">{item.body}</p><div className="flex gap-3">{item.status === 'pending' && <><button disabled={busy} onClick={() => act('comments', item.id, 'approve').catch(() => {})} className={`${buttonClass} text-emerald-700`}>Aprovar comentário</button><button disabled={busy} onClick={() => act('comments', item.id, 'reject').catch(() => {})} className={`${buttonClass} text-rose-700`}>Rejeitar comentário</button></>}<button disabled={busy} onClick={() => setRemove(item)} className={`${buttonClass} text-rose-700`}>Excluir comentário</button></div></>}
      {section === 'reports' && <><strong>{item.placeName || 'Contribuição removida'} · {item.reason.replaceAll('_', ' ')}</strong><p className="text-xs text-slate-500">{stamp(item.createdAt)}</p><p className="break-words">{item.content}</p><p className="break-words">{item.details}</p>{item.photoId && <img loading="lazy" src={`/api/photos/${item.photoId}`} alt="Fotografia denunciada" className="max-h-64 object-contain rounded-xl" />}<div className="flex flex-wrap gap-3"><button disabled={busy} onClick={() => act(item.targetType, item.targetId, item.targetType === 'comments' ? 'delete' : 'reject').catch(() => {})} className={`${buttonClass} text-rose-700`}>Remover informação denunciada</button><button disabled={busy} onClick={() => act('reports', item.id, 'resolve').catch(() => {})} className={buttonClass}>Marcar como revisada</button></div></>}
      {section === 'audit' && <><strong>{labels[item.action] || item.action}</strong><p className="text-xs text-slate-500">{stamp(item.createdAt)} · {item.administrator}</p><p className="text-xs break-all">{item.targetType}: {item.targetId}</p>{item.notes && <p className="text-xs break-words">{item.notes}</p>}</>}
    </article>)}
    {!result.items.length && <p className="text-sm text-slate-500">Nenhum registro nesta seção.</p>}<Pager result={result} onPage={page => load(page).catch(error => setError(error.message))} />
    {remove && <ConfirmAction title="Excluir comentário" description={`Remover o comentário de ${remove.displayName} em ${remove.placeName}?`} onClose={() => setRemove(null)} action={() => act('comments', remove.id, 'delete')} />}
  </div>;
}
