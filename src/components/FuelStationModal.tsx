import { ApiImage } from './ApiImage';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Fuel, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fuelApi, FuelApiError } from '../services/fuelApi';
import { validatePriceDraft } from '../services/fuelPriceRules';
import { FUEL_OPTIONS, type FuelKind, type FuelStation, type PriceDraft } from '../types/fuel';
import { PlaceComments } from './PlaceComments';
import { useModalScrollLock } from '../hooks/useModalScrollLock';

type EditablePrice = { fuelType: FuelKind; price: string; customLabel: string };
const editable = (draft?: PriceDraft): EditablePrice => ({ fuelType: draft?.fuelType || 'gasolina_comum', price: draft ? String(draft.price) : '', customLabel: draft?.customLabel || '' });
const localNow = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const money = (price: number) => `R$ ${price.toFixed(3).replace('.', ',')}`;

export function FuelStationModal({ stationId, onClose, initialSection = 'prices', initialMode='view' }: { stationId: string; onClose: () => void; initialSection?: 'prices' | 'comments'; initialMode?:'view'|'edit' }) {
  const auth = useAuth();
  const [section, setSection] = useState(initialSection);
  useModalScrollLock();
  const [station, setStation] = useState<FuelStation | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit' | 'review' | 'photo'>(initialMode);
  const [rows, setRows] = useState<EditablePrice[]>([editable()]);
  const [observedAt, setObservedAt] = useState(localNow);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (!selectedFile) { setPreview(''); return; }
    const url = URL.createObjectURL(selectedFile); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);
  const [myPhotos, setMyPhotos] = useState<{ id: string; status: string; created_at: string; reviewNote?: string }[]>([]);
  const [report, setReport] = useState<{ type: 'prices' | 'photos'; id: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    fuelApi<FuelStation>(`/stations/${encodeURIComponent(stationId)}`).then(value => { if (active) setStation(value); }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [stationId, auth.user?.id]);
  const loadMyPhotos = () => {
    if (!auth.user) { setMyPhotos([]); return; }
    fuelApi<typeof myPhotos>(`/stations/${encodeURIComponent(stationId)}/my-photos`).then(setMyPhotos).catch(() => {});
  };
  useEffect(loadMyPhotos, [stationId, auth.user?.id, message]);
  const removePhoto = async (id: string) => {
    setBusy(true); setError('');
    try {
      await fuelApi(`/photos/${id}`, { method: 'DELETE' });
      loadMyPhotos();
      setStation(await fuelApi<FuelStation>(`/stations/${encodeURIComponent(stationId)}`));
      setMessage('Foto removida.');
    } catch (error) { handleError(error); } finally { setBusy(false); }
  };
  const handleError = (error: unknown) => {
    setError((error as Error).message);
    if (error instanceof FuelApiError && error.status === 401) auth.promptLogin();
  };
  const requireLogin = () => { if (!auth.user) { auth.promptLogin(); return false; } return true; };
  const choosePhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setError('Escolha uma foto de até 8 MB.'); return; }
    setSelectedFile(file); setError('');
  };
  const photoUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedFile || !requireLogin()) return;
    setBusy(true); setError(''); setMessage('');
    const form = new FormData(); form.append('photo', selectedFile); form.append('confirmedStation', 'true'); form.append('observedAt', new Date(observedAt).toISOString());
    try {
      const result = await fuelApi<{ message: string }>(`/stations/${encodeURIComponent(stationId)}/photos`, { method: 'POST', body: form });
      setSelectedFile(null); setMessage(result.message); setMode('view');
    } catch (error) { handleError(error); } finally { setBusy(false); }
  };
  const drafts = () => rows.map(row => validatePriceDraft({ fuelType: row.fuelType, price: Number(row.price.replace(',', '.')), customLabel: row.customLabel }));
  const review = (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if(!station){setError('Não foi possível carregar os dados deste posto. Confira a conexão e tente novamente.');return;}
    try {
      const values = drafts();
      if (new Set(values.map(p => `${p.fuelType}:${p.customLabel || ''}`)).size !== values.length) throw new Error('Informe cada combustível apenas uma vez.');
      if (!Number.isFinite(Date.parse(observedAt))) throw new Error('Informe quando você viu os preços.');
      setMode('review');
    } catch (error) { handleError(error); }
  };
  const publish = async () => {
    if (!requireLogin()) return;
    setBusy(true); setError('');
    try {
      const result = await fuelApi<{ station: FuelStation; entries: { status: string }[] }>(`/stations/${encodeURIComponent(stationId)}/prices`, { method: 'POST', body: JSON.stringify({ prices: drafts(), observedAt: new Date(observedAt).toISOString(), confirmed: true }) });
      setStation(result.station); setMode('view');
      setMessage('Preços enviados para análise. A publicação depende da aprovação do administrador.');
    } catch (error) { handleError(error); }
    finally { setBusy(false); }
  };
  const vote = async (id: string, value: 'confirm' | 'contest') => {
    if (!requireLogin()) return;
    setBusy(true); setError('');
    try { setStation(await fuelApi<FuelStation>(`/prices/${id}/vote`, { method: 'POST', body: JSON.stringify({ vote: value }) })); }
    catch (error) { handleError(error); } finally { setBusy(false); }
  };
  const sendReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!requireLogin() || !report) return;
    const form = new FormData(event.currentTarget); setBusy(true); setError('');
    try { await fuelApi(`/${report.type}/${report.id}/report`, { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) }); setReport(null); setMessage('Denúncia enviada para revisão.'); }
    catch (error) { handleError(error); } finally { setBusy(false); }
  };

  return createPortal(<div className="fixed inset-0 z-80 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Preços do posto">
    <section className="w-full max-w-xl max-h-[92dvh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl">
      <header className="p-5 border-b flex items-start justify-between gap-3">
        <div><h2 className="font-bold text-base flex items-center gap-2"><Fuel className="w-5 h-5 text-emerald-600" />{station?.name || 'Carregando posto...'}</h2><p className="text-xs text-slate-500 mt-1">{station?.address || 'Posto identificado no mapa'}</p></div>
        <button onClick={onClose} aria-label="Fechar posto"><X className="w-5 h-5" /></button>
      </header>
      <div className="p-5 space-y-4 overflow-y-auto text-sm">
        <nav aria-label="Opções do posto" className="flex gap-2"><button type="button" aria-pressed={section === 'prices'} onClick={() => setSection('prices')} className={`rounded-xl px-4 py-2 font-bold text-xs ${section === 'prices' ? 'bg-emerald-600 text-white' : 'border'}`}>Preços</button><button type="button" aria-pressed={section === 'comments'} onClick={() => setSection('comments')} className={`rounded-xl px-4 py-2 font-bold text-xs ${section === 'comments' ? 'bg-emerald-600 text-white' : 'border'}`}>Comentários</button></nav>
        {section === 'comments' ? <PlaceComments placeId={stationId} title="Comentários do posto" /> : <>
        {error && <p role="alert" className="text-xs p-3 rounded-xl bg-rose-50 text-rose-700">{error}</p>}
        {message && <p role="status" className="text-xs p-3 rounded-xl bg-emerald-50 text-emerald-800">{message}</p>}
        {station && <div className="text-xs text-slate-500 space-y-1"><a href={station.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">Ver estabelecimento no OpenStreetMap</a>{station.openingHours && <p>Horário: {station.openingHours} · {station.openingHoursVerifiedAt ? `confirmado em ${new Date(station.openingHoursVerifiedAt).toLocaleDateString('pt-BR')}` : 'não confirmado'}</p>}</div>}
        {auth.user?.role === 'admin' && station && <details className="text-xs"><summary className="font-semibold cursor-pointer">Verificar horário deste posto</summary><form className="mt-2 space-y-2" onSubmit={async event => { event.preventDefault(); const fields = new FormData(event.currentTarget); setBusy(true); try { setStation(await fuelApi<FuelStation>(`/admin/stations/${encodeURIComponent(stationId)}/hours`, { method: 'POST', body: JSON.stringify({ openingHours: fields.get('openingHours'), confirmed: true }) })); setMessage('Horário verificado e registrado.'); } catch (error) { handleError(error); } finally { setBusy(false); } }}><input required name="openingHours" maxLength={200} defaultValue={station.openingHours} placeholder="Horário confirmado com o posto" className="w-full border rounded-lg p-2" /><label className="flex gap-2"><input type="checkbox" required />Confirmei este horário diretamente com o posto</label><button disabled={busy} className="text-emerald-700 font-bold">Registrar verificação</button></form></details>}
        {mode === 'view' && <>
          {station?.prices.length === 0 && <div className="border border-dashed rounded-2xl p-5 text-center text-slate-500">Ainda não há preços informados para este posto.<p className="text-xs mt-1">Envie uma foto ou um valor verificado para análise.</p></div>}
          {station?.prices.map(price => {
            const fuel = FUEL_OPTIONS.find(item => item.id === price.fuelType)!;
            return <article key={price.id} className="border border-slate-200 rounded-2xl p-4 space-y-2">
              <div className="flex justify-between items-center gap-2"><strong>{price.customLabel || fuel.label}</strong><strong className="text-lg text-emerald-700 tabular-nums">{money(price.price)}<span className="text-xs text-slate-500 font-normal">/{fuel.unit}</span></strong></div>
              <p className="text-xs text-slate-500">Data da informação: {new Date(price.observedAt).toLocaleString('pt-BR')} · Origem: {price.source === 'admin' ? 'administração' : 'contribuição da comunidade'}</p>
              <p className="text-[11px] text-slate-400">Atualizado em {new Date(price.publishedAt).toLocaleString('pt-BR')}</p>
              <p className="text-xs flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" />Confiabilidade {price.reliability.toLowerCase()} · {price.confirmations} confirmações · {price.contests} contestações</p>
              {!price.stale && <p className="text-xs text-emerald-700">Informação recente · revisada pelo administrador</p>}
              {price.stale && <p className="text-xs font-bold text-amber-800">Desatualizado: este preço pode ter mudado. Não entra na comparação.</p>}
              {price.disputed && <p className="text-xs font-bold text-rose-700">Preço contestado. Aguardando novas confirmações ou revisão.</p>}
              <div className="flex flex-wrap gap-2 text-xs">
                {!price.isMine && <><button disabled={busy} onClick={() => vote(price.id, 'confirm')} className="border rounded-lg px-2 py-1 text-emerald-700">{price.myVote === 'confirm' ? '✓ Confirmado por você' : 'Confirmar preço'}</button><button disabled={busy} onClick={() => vote(price.id, 'contest')} className="border rounded-lg px-2 py-1 text-amber-800">{price.myVote === 'contest' ? 'Contestado por você' : 'Contestar preço'}</button></>}
                <button onClick={() => { if (requireLogin()) setReport({ type: 'prices', id: price.id }); }} className="text-slate-500 underline">Denunciar preço</button>
              </div>
              {price.photoId && <details className="text-xs"><summary className="cursor-pointer text-emerald-700">Ver foto revisada</summary><ApiImage path={`/photos/${price.photoId}`} alt="Placa de preços do posto" className="mt-2 rounded-xl max-h-60 object-contain" /><button onClick={() => { if (requireLogin()) setReport({ type: 'photos', id: price.photoId! }); }} className="mt-2 text-rose-700 underline">Denunciar foto ou dados pessoais</button></details>}
            </article>;
          })}
          <div className="flex gap-2"><button disabled={busy || !station} onClick={() => { if (requireLogin()) { setRows([editable()]); setMode('edit'); setError(''); } }} className="flex-1 rounded-xl bg-emerald-600 text-white p-3 font-bold text-xs">Sugerir preço</button><button disabled={busy || !station} onClick={() => { if (requireLogin()) { setMode('photo'); setSelectedFile(null); setError(''); } }} className="flex-1 rounded-xl border p-3 font-bold text-xs flex items-center justify-center gap-2"><Camera className="w-4 h-4" />Enviar foto dos preços</button></div>
          <p className="text-xs text-slate-500">Fotografe somente com o veículo parado. Evite rostos, placas de veículos e outros dados pessoais. Fotos ficam privadas até a moderação.</p>
        </>}
        {mode === 'photo' && <form onSubmit={photoUpload} className="space-y-4">
          <h3 className="font-bold">Enviar foto dos preços</h3>
          <p className="text-xs text-slate-500">O administrador confere a fotografia e preenche os preços. Fotografe somente com o veículo parado e evite dados pessoais. Não há leitura automática.</p>
          <div className="flex gap-2"><button type="button" onClick={() => cameraRef.current?.click()} className="border rounded-xl p-3 text-xs font-bold">Tirar foto</button><button type="button" onClick={() => fileRef.current?.click()} className="border rounded-xl p-3 text-xs font-bold">Selecionar da galeria</button></div>
          {preview && <img src={preview} alt="Foto selecionada para envio" className="rounded-xl max-h-64 mx-auto object-contain" />}
          <label className="block text-xs font-semibold">Quando a foto foi tirada?<input required type="datetime-local" value={observedAt} max={localNow()} onChange={e => setObservedAt(e.target.value)} className="block mt-1 border rounded-xl p-3 w-full" /></label>
          <label className="flex gap-2 text-xs"><input type="checkbox" required />Confirmo que a foto corresponde ao posto {station?.name}.</label>
          <div className="flex gap-2"><button type="button" onClick={() => { setSelectedFile(null); setMode('view'); }} className="border rounded-xl p-3 text-xs">Voltar</button><button disabled={busy || !selectedFile} className="flex-1 bg-emerald-600 text-white rounded-xl p-3 text-xs font-bold disabled:opacity-50">{busy ? 'Enviando...' : 'Enviar para análise'}</button></div>
        </form>}
        {mode === 'edit' && <form onSubmit={review} className="space-y-4">
          {!auth.user&&!auth.loading&&<div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
            Entre na sua conta para enviar os preços para análise.
            <button type="button" onClick={()=>auth.promptLogin()} className="ml-2 font-bold underline">Entrar</button>
          </div>}
          <p className="text-xs text-slate-500">Informe os preços verificados neste posto. Eles serão analisados antes da publicação.</p>

          {rows.map((row, index) => <div key={index} className="p-3 bg-slate-50 rounded-xl space-y-2">
            <div className="flex gap-2"><select aria-label={`Combustível ${index + 1}`} value={row.fuelType} onChange={e => setRows(current => current.map((r, i) => i === index ? { ...r, fuelType: e.target.value as FuelKind } : r))} className="border rounded-lg p-2 flex-1 min-w-0">{FUEL_OPTIONS.map(fuel => <option key={fuel.id} value={fuel.id}>{fuel.label}</option>)}</select>{rows.length > 1 && <button type="button" aria-label={`Remover combustível ${index + 1}`} onClick={() => setRows(current => current.filter((_, i) => i !== index))}>✕</button>}</div>
            {row.fuelType === 'outro' && <input aria-label="Nome do combustível" placeholder="Nome do combustível" required maxLength={50} value={row.customLabel} onChange={e => setRows(current => current.map((r, i) => i === index ? { ...r, customLabel: e.target.value } : r))} className="border rounded-lg p-2 w-full" />}
            <label className="block text-xs font-semibold">Preço por {FUEL_OPTIONS.find(f => f.id === row.fuelType)!.unit}<input aria-label={`Preço ${index + 1}`} inputMode="decimal" required value={row.price} onChange={e => setRows(current => current.map((r, i) => i === index ? { ...r, price: e.target.value } : r))} placeholder="Ex.: 5,899" className="mt-1 border rounded-lg p-3 w-full" /></label>
          </div>)}
          {rows.length < 8 && <button type="button" className="text-xs font-bold text-emerald-700" onClick={() => setRows(current => [...current, editable()])}>+ Outro combustível</button>}
          <label className="block text-xs font-semibold">Quando você viu estes preços?<input type="datetime-local" required value={observedAt} max={localNow()} onChange={e => setObservedAt(e.target.value)} className="mt-1 border rounded-lg p-3 w-full" /></label>
          <div className="flex gap-2"><button type="button" onClick={() => setMode('view')} className="border rounded-xl p-3 text-xs">Voltar</button><button disabled={!station} className="flex-1 bg-emerald-600 text-white rounded-xl p-3 font-bold text-xs disabled:opacity-50">Revisar preços</button></div>
        </form>}
        {mode === 'review' && <div className="space-y-4"><h3 className="font-bold">Confira antes de enviar</h3>{rows.map((row, index) => <p key={index} className="flex justify-between text-sm">{row.customLabel || FUEL_OPTIONS.find(f => f.id === row.fuelType)!.label}<strong>{money(Number(row.price.replace(',', '.')))}</strong></p>)}<p className="text-xs text-slate-500">Observado em {new Date(observedAt).toLocaleString('pt-BR')}. Os valores serão analisados pelo administrador.</p><div className="flex gap-2"><button disabled={busy} onClick={() => setMode('edit')} className="border rounded-xl p-3 text-xs">Corrigir</button><button disabled={busy} onClick={publish} className="flex-1 rounded-xl p-3 bg-emerald-600 text-white font-bold text-xs">{busy ? 'Enviando...' : 'Confirmar e enviar para análise'}</button></div></div>}
        {report && <form onSubmit={sendReport} className="space-y-3 border rounded-xl p-3 bg-rose-50"><strong className="text-sm">Denunciar contribuição</strong><select name="reason" aria-label="Motivo da denúncia" className="w-full border rounded-lg p-2"><option value="preco_incorreto">Preço incorreto</option><option value="spam">Spam</option><option value="dados_pessoais">Dados pessoais expostos</option><option value="imagem_inadequada">Imagem inadequada</option><option value="outro">Outro motivo</option></select><textarea name="details" aria-label="Detalhes da denúncia" maxLength={300} placeholder="Descreva o problema sem incluir dados pessoais" className="w-full border rounded-lg p-2" /><div className="flex gap-3"><button disabled={busy} className="text-xs font-bold text-rose-700">Enviar denúncia</button><button type="button" onClick={() => setReport(null)} className="text-xs">Cancelar</button></div></form>}
        {myPhotos.length > 0 && <details className="text-xs border-t pt-3"><summary className="cursor-pointer text-slate-600 font-semibold">Minhas fotos neste posto</summary>{myPhotos.map(item => <div key={item.id} className="mt-2 flex items-center justify-between gap-3"><span>{new Date(item.created_at).toLocaleDateString('pt-BR')} · {item.status === 'approved' ? 'aprovada' : item.status === 'rejected' ? 'rejeitada' : item.status === 'new_requested' ? 'nova foto solicitada' : 'aguardando revisão'}{item.reviewNote && <span className="block text-amber-800">{item.reviewNote}</span>}</span><button disabled={busy} onClick={() => removePhoto(item.id)} className="text-rose-700 underline">Remover minha foto</button></div>)}</details>}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={choosePhoto} />
        <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={choosePhoto} />
        </>}
      </div>
    </section>
  </div>, document.body);
}

