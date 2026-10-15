import React, { useEffect, useState } from 'react';
import { fuelApi } from '../../services/fuelApi';
import { PLACE_KINDS, type Place, type PageResult, type PriceHistory } from '../../types/admin';
import { PriceEditor } from '../PriceEditor';
import { ManualPlaceForm } from './ManualPlaceForm';
import { buttonClass, inputClass, Pager, History, ConfirmAction } from './shared';

export function PlacesManager({ onChange }: { onChange: () => void }) {
  const [result, setResult] = useState<PageResult<Place>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [q, setQ] = useState(''), [kind, setKind] = useState(''), [reference, setReference] = useState('');
  const [selected, setSelected] = useState<Place | null>(null), [remove, setRemove] = useState<Place | null>(null);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const load = (page = 1) => fuelApi<PageResult<Place>>(`/admin/places?page=${page}&q=${encodeURIComponent(q)}&kind=${kind}`).then(setResult);
  useEffect(() => { load().catch(error => setError(error.message)); }, []);
  const act = async <T,>(path: string, body: unknown, method = 'POST'): Promise<T> => {
    setBusy(true); setError('');
    try { const value = await fuelApi<T>(path, { method, body: JSON.stringify(body) }); await load(result.page); onChange(); return value; }
    catch (error) { setError((error as Error).message); throw error; } finally { setBusy(false); }
  };
  return <div className="space-y-5"><h2 className="text-xl font-bold">Estabelecimentos e unidades</h2>
    <p className="text-sm text-slate-500">Gerencie cada unidade pelo seu ponto no mapa. Postos, restaurantes e outras atrações cadastradas aparecem no aplicativo.</p>
    {error && <p role="alert" className="bg-rose-50 text-rose-700 p-3 rounded-xl text-sm">{error}</p>}{message && <p role="status" className="bg-emerald-50 text-emerald-800 p-3 rounded-xl text-sm">{message}</p>}
    <ManualPlaceForm onSaved={place => { setMessage('Local cadastrado e publicado no aplicativo.'); setSelected(place); load(1).catch(error => setError(error.message)); onChange(); }} />
    <details className="bg-white rounded-2xl border p-5"><summary className="text-sm cursor-pointer font-bold">Importar local existente pelo link do OpenStreetMap</summary><form className="mt-3 space-y-3" onSubmit={async event => { event.preventDefault(); try { const place = await act<Place>('/admin/places', { reference }); setReference(''); setSelected(place); setMessage('Estabelecimento verificado no mapa e cadastrado.'); } catch {} }}>
      <h3 className="font-bold">Adicionar estabelecimento real</h3><label className="block text-xs font-semibold">Link do estabelecimento no OpenStreetMap<input required value={reference} maxLength={300} onChange={e => setReference(e.target.value)} placeholder="https://www.openstreetmap.org/node/..." className={`${inputClass} mt-1`} /></label>
      <p className="text-xs text-slate-500">Abra o ponto no <a href="https://www.openstreetmap.org" target="_blank" rel="noopener noreferrer" className="underline text-emerald-700">OpenStreetMap</a> e copie seu link. O cadastro verifica a existência e a localização.</p><button disabled={busy} className={`${buttonClass} bg-emerald-600 border-emerald-600 text-white`}>Verificar e cadastrar</button>
    </form></details>
    <form className="flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); load().catch(error => setError(error.message)); }}><input aria-label="Buscar estabelecimentos" value={q} onChange={e => setQ(e.target.value)} maxLength={100} placeholder="Buscar nome ou endereço" className={`${inputClass} flex-1 min-w-48`} /><select aria-label="Categoria do estabelecimento" value={kind} onChange={e => setKind(e.target.value)} className="border rounded-xl p-3 text-sm"><option value="">Todas as categorias</option>{PLACE_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select><button className={buttonClass}>Buscar</button></form>
    <div className="bg-white rounded-2xl border overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-slate-50"><tr><th className="p-4">Estabelecimento</th><th className="p-4">Categoria</th><th className="p-4">Estado</th><th className="p-4">Ações</th></tr></thead><tbody>{result.items.map(place => <tr key={place.id} className="border-t"><td className="p-4"><strong>{place.name}</strong><p className="text-xs text-slate-500">{place.address || 'Endereço não informado'}</p></td><td className="p-4">{PLACE_KINDS.find(k => k.id === place.kind)?.label}</td><td className="p-4">{place.active ? 'Ativo' : 'Excluído do mapa'}</td><td className="p-4 whitespace-nowrap"><button onClick={() => setSelected(place)} className="text-emerald-700 font-semibold mr-4">Editar</button>{place.active && <button onClick={() => setRemove(place)} className="text-rose-700">Excluir</button>}</td></tr>)}</tbody></table>{!result.items.length && <p className="p-4 text-sm text-slate-500">Nenhum cadastro encontrado.</p>}</div>
    <Pager result={result} onPage={page => load(page).catch(error => setError(error.message))} />
    {selected && <PlaceEditor key={selected.id} place={selected} busy={busy} onClose={() => setSelected(null)} onSave={async body => { const updated = await act<Place>(`/admin/places/${encodeURIComponent(selected.id)}`, body, 'PATCH'); setSelected(updated); setMessage('Cadastro atualizado.'); }} onPrice={async (prices, observedAt) => { await act(`/admin/stations/${encodeURIComponent(selected.id)}/prices`, { prices, observedAt, confirmed: true }); setMessage('Preços atualizados; o histórico anterior foi preservado.'); }} />}
    {remove && <ConfirmAction title="Excluir estabelecimento" description={`Excluir ${remove.name} do mapa? Os preços e o histórico serão preservados. O cadastro poderá ser reativado depois.`} onClose={() => setRemove(null)} action={async () => { await act(`/admin/places/${encodeURIComponent(remove.id)}`, { confirmed: true }, 'DELETE'); if (selected?.id === remove.id) setSelected(null); setMessage('Estabelecimento excluído do mapa.'); }} />}
  </div>;
}
function PlaceEditor({ place, busy, onSave, onPrice, onClose }: { place: Place; busy: boolean; onSave: (body: unknown) => Promise<void>; onPrice: (prices: any[], date: string) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState({ name: place.name, kind: place.kind, address: place.address, description: place.description, phone: place.phone, website: place.website, openingHours: place.openingHours || '', active: place.active, hoursVerified: false });
  const [history, setHistory] = useState<PriceHistory[]>([]), [error, setError] = useState(''), [message, setMessage] = useState('');
  const loadHistory = () => fuelApi<{ items: PriceHistory[] }>(`/admin/places/${encodeURIComponent(place.id)}/history`).then(result => setHistory(result.items)).catch(error => setError(error.message));
  useEffect(() => { if (place.kind === 'fuel') loadHistory(); }, [place.id]);
  return <section aria-label={`Editar ${place.name}`} className="bg-white rounded-2xl border p-5 space-y-4"><div className="flex justify-between gap-3"><h3 className="font-bold">Editar: {place.name}</h3><button className="text-sm" onClick={onClose}>Fechar edição</button></div><a href={place.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-700 underline">Ver referência e localização no mapa</a>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}{message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
    <form className="space-y-3" onSubmit={async event => { event.preventDefault(); setError(''); try { await onSave(draft); setMessage('Dados salvos.'); } catch (error) { setError((error as Error).message); } }}>
      <label className="block text-xs font-semibold">Categoria<select value={draft.kind} onChange={event => setDraft(value => ({ ...value, kind: event.target.value as Place['kind'] }))} className={`${inputClass} mt-1`}>{PLACE_KINDS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <div className="grid md:grid-cols-2 gap-3">{([['name', 'Nome', 150], ['address', 'Endereço', 250], ['phone', 'Telefone do estabelecimento', 50], ['website', 'Site', 300], ['openingHours', 'Horário de funcionamento', 200]] as const).map(([key, label, max]) => <label key={key} className="block text-xs font-semibold">{label}<input required={key === 'name'} maxLength={max} value={draft[key]} onChange={e => setDraft(value => ({ ...value, [key]: e.target.value }))} className={`${inputClass} mt-1`} /></label>)}</div>
      <label className="block text-xs font-semibold">Descrição<textarea maxLength={1000} value={draft.description} onChange={e => setDraft(value => ({ ...value, description: e.target.value }))} className={`${inputClass} mt-1`} /></label>
      <label className="flex gap-2 text-xs"><input type="checkbox" checked={draft.active} onChange={e => setDraft(value => ({ ...value, active: e.target.checked }))} />Cadastro ativo no mapa</label><label className="flex gap-2 text-xs"><input type="checkbox" checked={draft.hoursVerified} onChange={e => setDraft(value => ({ ...value, hoursVerified: e.target.checked }))} />Confirmei o horário diretamente com o estabelecimento</label><button disabled={busy} className={`${buttonClass} bg-emerald-600 border-emerald-600 text-white`}>Salvar cadastro</button>
    </form>
    {place.kind === 'fuel' && <><History items={history} />{place.active && <details className="border-t pt-4"><summary className="cursor-pointer font-bold text-sm">Atualizar ou corrigir preços</summary><div className="mt-3"><PriceEditor busy={busy} onSubmit={async (prices, date) => { await onPrice(prices, date); await loadHistory(); setMessage('Preços publicados.'); }} /></div></details>}</>}
  </section>;
}
