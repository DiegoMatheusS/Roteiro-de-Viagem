import React, { useState } from 'react';
import { FUEL_OPTIONS } from '../../types/fuel';
import type { PageResult, PriceHistory } from '../../types/admin';

export const inputClass = 'w-full border border-slate-200 rounded-xl p-3 text-sm';
export const buttonClass = 'rounded-xl px-4 py-2.5 text-sm font-semibold border border-slate-200 disabled:opacity-50';
export const stamp = (date: string) => new Date(date).toLocaleString('pt-BR');
export function Pager({ result, onPage }: { result: PageResult<unknown>; onPage: (page: number) => void }) {
  return <div className="flex gap-3 items-center text-xs py-3"><span>{result.total} registro(s) · página {result.page}</span><button className={buttonClass} disabled={result.page <= 1} onClick={() => onPage(result.page - 1)}>Anterior</button><button className={buttonClass} disabled={result.page * result.pageSize >= result.total} onClick={() => onPage(result.page + 1)}>Próxima</button></div>;
}
export function History({ items }: { items: PriceHistory[] }) {
  return <details className="border rounded-xl p-3 text-xs"><summary className="font-bold cursor-pointer">Histórico de preços ({items.length} últimas atualizações)</summary><div className="overflow-x-auto mt-3"><table className="w-full text-left"><thead><tr className="text-slate-500"><th className="p-2">Combustível</th><th className="p-2">Valor</th><th className="p-2">Informação</th><th className="p-2">Estado</th><th className="p-2">Revisor</th></tr></thead><tbody>{items.map(item => <tr key={item.id} className="border-t"><td className="p-2">{item.customLabel || FUEL_OPTIONS.find(f => f.id === item.fuelType)?.label}</td><td className="p-2 whitespace-nowrap">R$ {item.price.toFixed(3).replace('.', ',')}</td><td className="p-2 whitespace-nowrap">{stamp(item.observedAt)}</td><td className="p-2">{item.status === 'published' ? 'Publicado' : item.status === 'pending_review' ? 'Pendente' : item.status === 'reviewed' ? 'Revisado' : 'Rejeitado'}</td><td className="p-2">{item.reviewer || '—'}</td></tr>)}</tbody></table>{!items.length && <p className="text-slate-500">Sem preços anteriores.</p>}</div></details>;
}
export function ConfirmAction({ title, description, action, onClose }: { title: string; description: string; action: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-80 bg-slate-900/60 p-4 flex items-center justify-center"><section className="bg-white rounded-3xl p-6 max-w-md space-y-4"><h2 className="font-bold text-lg">{title}</h2><p className="text-sm text-slate-600">{description}</p>{error && <p role="alert" className="text-rose-700 text-sm">{error}</p>}<div className="flex gap-3"><button disabled={busy} className={buttonClass} onClick={onClose}>Cancelar</button><button disabled={busy} className={`${buttonClass} bg-rose-600 text-white border-rose-600`} onClick={async () => { setBusy(true); try { await action(); onClose(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }}>{busy ? 'Aguarde...' : 'Confirmar exclusão'}</button></div></section></div>;
}
