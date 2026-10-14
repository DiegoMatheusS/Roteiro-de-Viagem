import React, { useEffect,useState } from 'react';
import type { RouteToll } from '../types/tolls';
import { useAuth } from '../contexts/AuthContext';
import { fuelApi } from '../services/fuelApi';
const localDay=() => { const date=new Date(); return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,10); };
interface Contribution { id:string;vehicle_type:string;price:number|null;observed_at:string;status:string;notes:string;reviewed_at:string|null }
export function TollContribution({toll,vehicleType,initialOpen=false}: {toll:RouteToll;vehicleType:'car'|'motorcycle';initialOpen?:boolean}) {
  const auth=useAuth();
  const [open,setOpen]=useState(initialOpen),[price,setPrice]=useState(''),[date,setDate]=useState(localDay);
  const [photo,setPhoto]=useState<File|null>(null),[preview,setPreview]=useState(''),[heading,setHeading]=useState(''),[both,setBoth]=useState(true),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [mine,setMine]=useState<Contribution[]>([]),[historyError,setHistoryError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(() => { if(!photo) {setPreview('');return;} const url=URL.createObjectURL(photo);setPreview(url);return () => URL.revokeObjectURL(url); },[photo]);
  useEffect(() => {
    setMine([]); if(!open || !auth.user) return;
    const controller=new AbortController();setHistoryError('');
    fuelApi<{entries:Contribution[]}>(`/tolls/${encodeURIComponent(toll.id)}/contributions`,{signal:controller.signal}).then(r => {if(!controller.signal.aborted)setMine(r.entries);}).catch(e => {if(!controller.signal.aborted)setHistoryError(e.message);});
    return () => controller.abort();
  },[open,auth.user?.id,toll.id,revision]);
  const choosePhoto=(file?:File) => {
    if(file && file.size > 8*1024*1024) {setMessage('Envie uma foto de até 8 MB.');return;}
    setPhoto(file || null);setMessage('');
  };
  const submit=async (e:React.FormEvent) => {
    e.preventDefault();if(!auth.user){auth.promptLogin();return;}
    setBusy(true);setMessage('');
    try {
      const form=new FormData();form.append('price',price.replace(',','.'));form.append('vehicleType',vehicleType);
      form.append('observedAt',new Date(date+'T00:00:00').toISOString());form.append('confirmed',String(confirmed));form.append('headingDegrees',both?'':heading);
      if(photo)form.append('photo',photo);
      const result=await fuelApi<{message:string}>(`/tolls/${encodeURIComponent(toll.id)}/contributions`,{method:'POST',body:form});
      setMessage(result.message);setPhoto(null);setPrice('');setConfirmed(false);setRevision(v => v+1);
      window.dispatchEvent(new Event('rdv:tolls-changed'));
    } catch(error){setMessage((error as Error).message);}finally{setBusy(false);}
  };
  const directions=[...new Set((toll.tariffs || []).map(t => Math.round(t.headingDegrees)%360))];
  const cardinal=(value:number) => ['Norte','Nordeste','Leste','Sudeste','Sul','Sudoeste','Oeste','Noroeste'][Math.round(value/45)%8];
  const known=toll.knownCost ?? (toll.price == null ? 0 : toll.price*toll.passages);
  const hasKnown=toll.tariffs ? toll.tariffs.some(t => t.price !== null) : toll.price !== null;
  return <div className="border rounded-xl p-3 space-y-3 text-xs">
    <div className="flex justify-between gap-3"><a href={toll.sourceUrl} target="_blank" rel="noreferrer" className="font-bold underline">{toll.name}</a><strong>{hasKnown?`R$ ${known.toFixed(2)} conhecidos`:'Sem tarifa aprovada'}</strong></div>
    <p className="text-slate-500">{toll.passages} passagem(ns) · {vehicleType==='motorcycle'?'Moto':'Carro'} · Cobertura parcial</p>
    {toll.tariffs?.map((tariff,index) => <p key={index} className="bg-slate-50 p-2 rounded-lg">Passagem {index+1}: <strong>{tariff.price == null?'Tarifa não informada':`R$ ${tariff.price.toFixed(2)}`}</strong>{tariff.observedAt && <> · Evidência: {new Date(tariff.observedAt).toLocaleDateString('pt-BR')}</>}{tariff.validUntil && <> · Válida até {new Date(tariff.validUntil).toLocaleDateString('pt-BR')}</>}</p>)}
    <button type="button" onClick={() => setOpen(!open)} className="text-emerald-700 font-bold">{open?'Fechar contribuição':'Informar tarifa ou enviar foto'}</button>
    {open && <><form onSubmit={submit} className="space-y-3"><label className="block">Valor por passagem (opcional com foto)<input aria-label="Tarifa do pedágio" value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" className="block w-full border rounded-lg p-2 mt-1" /></label>
      <label className="block">Data da tarifa<input aria-label="Data da tarifa" type="date" required max={localDay()} value={date} onChange={e => setDate(e.target.value)} className="block w-full border rounded-lg p-2" /></label>
      <label className="block">Escolher foto da placa<input aria-label="Foto da placa de pedágio" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => choosePhoto(e.target.files?.[0])} className="block max-w-full" /></label>
      <label className="block text-emerald-700 font-bold">Tirar foto da placa<input aria-label="Tirar foto da placa de pedágio" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e => choosePhoto(e.target.files?.[0])} className="block max-w-full font-normal" /></label>
      {preview && <div><img src={preview} alt="Foto da tarifa selecionada para envio" className="max-h-52 object-contain rounded-xl" /><button type="button" onClick={() => setPhoto(null)} className="mt-2 text-rose-700 underline">Remover foto selecionada</button></div>}
      <label className="flex gap-2"><input type="checkbox" checked={both} onChange={e => setBoth(e.target.checked)} />Mesma tarifa nos dois sentidos</label>{!both && <label className="block">Sentido da cobrança<select aria-label="Sentido da cobrança" required value={heading} onChange={e => setHeading(e.target.value)} className="block w-full border p-2 rounded-lg"><option value="">Escolha o sentido</option>{(directions.length ? directions : [0,45,90,135,180,225,270,315]).map(value => <option key={value} value={value}>{cardinal(value)}</option>)}</select></label>}

      <label className="flex gap-2"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Confirmo que a informação é deste pedágio e da categoria indicada.</label>
      <p className="text-slate-500">O administrador confere antes de publicar. Fotografe somente com o veículo parado.</p><button disabled={busy} className="px-4 py-2 bg-emerald-700 text-white rounded-xl">{busy?'Enviando...':'Enviar para análise'}</button></form>
      {auth.user && <section aria-label="Minhas contribuições de pedágio" className="space-y-2 border-t pt-3"><h4 className="font-bold">Minhas contribuições</h4><button type="button" onClick={() => setRevision(v => v+1)} className="text-emerald-700 underline">Atualizar minhas contribuições</button>{historyError && <p role="alert">{historyError}</p>}{mine.map(entry => <div key={entry.id} className="p-2 bg-slate-50 rounded-lg"><strong>{entry.status==='approved'?'Aprovada':entry.status==='rejected'?'Rejeitada':'Em análise'}</strong> · {entry.vehicle_type==='car'?'Carro':'Moto'} · {entry.price == null?'Foto para conferência':`R$ ${entry.price.toFixed(2)}`}<p>{new Date(entry.observed_at).toLocaleDateString('pt-BR')}{entry.notes && ` · ${entry.notes}`}</p></div>)}{!mine.length && !historyError && <p className="text-slate-500">Nenhuma contribuição sua nesta praça.</p>}</section>}
    </>}{message && <p role="status" className="p-2 bg-emerald-50 rounded-xl">{message}</p>}
  </div>;
}
