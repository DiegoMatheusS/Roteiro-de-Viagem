import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Bookmark,Home,MapPin,Plus,Search,Trash2,X} from 'lucide-react';
import {useAuth} from '../contexts/AuthContext';
import type {LocationSelection} from '../types/itinerary';
import {searchLocations} from '../services/locationSearch';
import {SAVED_ADDRESS_TYPES,readSavedAddresses,saveAddress,deleteSavedAddress,
  matchSavedAddressOrigin,type SavedAddress,type SavedAddressType} from '../services/savedAddresses';
import type {DeviceLocation} from '../services/locationService';
import {formatAddressDistance} from '../services/addressSuggestions';

export function SavedAddressesPanel({onSelect,gps,onChanged}:{
  onSelect:(place:LocationSelection)=>void;gps?:DeviceLocation|null;
  onChanged?:(addresses:SavedAddress[])=>void;
}){
  const {user,promptLogin}=useAuth();
  const [items,setItems]=useState<SavedAddress[]>([]);
  const [open,setOpen]=useState(false);
  const [type,setType]=useState<SavedAddressType>('Casa');
  const [custom,setCustom]=useState('');
  const [query,setQuery]=useState('');
  const [results,setResults]=useState<LocationSelection[]>([]);
  const [chosen,setChosen]=useState<LocationSelection|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const request=useRef<AbortController|null>(null);
  const lastQuery=useRef('');
  useEffect(()=>{setItems(readSavedAddresses(user?.id));},[user?.id]);
  useEffect(()=>()=>request.current?.abort(),[]);
  const clear=()=>{
    request.current?.abort();request.current=null;lastQuery.current='';
    setBusy(false);setError('');setQuery('');setResults([]);setChosen(null);
    setType('Casa');setCustom('');
  };
  const close=()=>{clear();setOpen(false);};
  const search=async(force=false)=>{
    if(query.trim().length<3){setError('Digite pelo menos 3 caracteres.');return;}
    if(!force&&lastQuery.current===query.trim())return;
    lastQuery.current=query.trim();
    request.current?.abort();
    const controller=new AbortController();request.current=controller;
    setBusy(true);setError('');setResults([]);setChosen(null);
    try{
      const found=await searchLocations(query.trim(),gps?.coords,controller.signal);
      if(controller.signal.aborted)return;
      setResults(found.results.slice(0,6));
      if(!found.results.length)setError('Nenhum endereço encontrado. Inclua a rua, número e cidade.');
    }catch(err){if(!controller.signal.aborted)setError((err as Error).message);}
    finally{if(request.current===controller){request.current=null;setBusy(false);}}
  };
  // Debounced live results: cancel old requests, including Android keyboard edits.
  useEffect(()=>{
    if(!open||query.trim().length<3)return;
    const timer=setTimeout(()=>{void search();},450);
    return ()=>clearTimeout(timer);
  },[open,query]);
  const save=()=>{
    if(!user){promptLogin();return;}
    if(!chosen?.coords){setError('Pesquise e selecione o endereço correto primeiro.');return;}
    try{
      const label=type==='Outro'?custom.trim():type;
      const next=saveAddress(user.id,{label,address:chosen.address||chosen.name,coords:chosen.coords});
      setItems(next);onChanged?.(next);close();
    }catch(err){setError((err as Error).message);}
  };
  const match=user?matchSavedAddressOrigin(gps,items):null;
  return <div className="space-y-2" aria-label="Endereços salvos">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-[13px] font-extrabold text-slate-900 flex items-center gap-1.5">
        <Bookmark size={16} className="text-blue-600"/> Endereços salvos
      </h2>
      <button type="button" onClick={()=>{if(!user){promptLogin();return;}clear();setOpen(true);}}
        className="flex items-center gap-1.5 text-[12px] font-bold text-blue-700 min-h-9 px-2"
        aria-label="Salvar endereço"><Plus size={17}/> Salvar endereço</button>
    </div>
    {user&&items.length>0
      ? <div className="flex gap-2 overflow-x-auto pb-1" data-testid="saved-address-list">
        {items.map(item=><div key={item.id} className="shrink-0 flex items-center rounded-xl bg-blue-50 border border-blue-100">
          <button type="button" onClick={()=>onSelect({name:item.label,address:item.address,coords:item.coords})}
            className="text-left flex items-center gap-2 px-3 py-2 max-w-[220px]" aria-label={`Ir para ${item.label}`}>
            {item.label==='Casa'?<Home size={18} className="text-blue-700 shrink-0"/>:<MapPin size={18} className="text-blue-700 shrink-0"/>}
            <span className="min-w-0"><strong className="block text-xs truncate">{item.label}</strong>
              <small className="block text-[10px] text-slate-600 truncate">{item.address}</small></span>
          </button>
          <button type="button" aria-label={`Excluir endereço ${item.label}`}
            className="p-2 text-slate-500" onClick={()=>{
              if(!user)return;
              try{const next=deleteSavedAddress(user.id,item.id);setItems(next);onChanged?.(next);}catch(err){setError((err as Error).message);}
            }}><Trash2 size={15}/></button>
        </div>)}
      </div>
      : <p className="text-[11px] text-slate-500">{user?'Cadastre Casa, Trabalho ou outro local para acessar com um toque.':'Entre na sua conta para cadastrar Casa, Trabalho e outros locais.'}</p>}
    {match&&<p role="status" className="text-[11px] text-emerald-700">Você está perto de {match.label}. Este endereço será sugerido como origem.</p>}
    {user&&gps&&gps.accuracyMeters>35&&<p className="text-[11px] text-amber-700">Precisão GPS estimada: {Math.round(gps.accuracyMeters)} m. Aguarde um sinal melhor para reconhecer seu local automaticamente.</p>}
    {open&&typeof document!=='undefined'&&createPortal(
      <div className="fixed inset-0 z-[200] bg-slate-950/60 flex items-end sm:items-center justify-center" role="presentation">
        <section role="dialog" aria-modal="true" aria-label="Cadastrar endereço salvo"
          className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[90dvh] overflow-y-auto p-5 space-y-4 shadow-2xl">
          <header className="flex items-center justify-between">
            <h2 className="font-extrabold text-lg text-slate-900">Salvar endereço</h2>
            <button type="button" onClick={close} aria-label="Fechar cadastro"><X size={22}/></button>
          </header>
          <label className="block text-sm font-bold text-slate-700">Nome do local
            <select value={type} onChange={e=>setType(e.target.value as SavedAddressType)}
              className="block w-full p-3 mt-1 border rounded-xl bg-white">
              {SAVED_ADDRESS_TYPES.map(item=><option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          {type==='Outro'&&<label className="block text-sm font-bold">Nome personalizado
            <input value={custom} maxLength={55} onChange={e=>setCustom(e.target.value)}
              placeholder="Ex.: Academia, Sogra, Mercado" className="block w-full mt-1 p-3 border rounded-xl"/>
          </label>}
          <form role="search" aria-label="Pesquisar endereço para salvar" onSubmit={e=>{e.preventDefault();void search(true);}}>
            <label className="block text-sm font-bold text-slate-700">Endereço
              <div className="flex gap-2 mt-1">
                <input value={query} maxLength={150} enterKeyHint="search"
                  onChange={e=>{request.current?.abort();request.current=null;lastQuery.current='';setBusy(false);setResults([]);setChosen(null);setError('');setQuery(e.target.value);}}
                  placeholder="Rua, número, bairro e cidade" aria-label="Endereço para salvar"
                  className="border rounded-xl p-3 min-w-0 flex-1 font-normal"/>
                <button type="submit" disabled={busy||query.trim().length<3}
                  className="bg-blue-600 text-white rounded-xl p-3 disabled:opacity-50"
                  aria-label="Pesquisar endereço para cadastro"><Search size={20}/></button>
              </div>
            </label>
          </form>
          {busy&&<p role="status" className="text-sm text-slate-600">Buscando sugestões de endereço...</p>}
          {!busy&&query.trim().length>=3&&results.length===0&&!error&&<p className="text-xs text-slate-500">As sugestões aparecem enquanto você digita.</p>}
          {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
          {results.length>0&&<div className="border rounded-xl divide-y max-h-48 overflow-y-auto" role="group" aria-label="Resultados de endereços">
            {results.map((place,i)=><button key={place.id??i} type="button" onClick={()=>{setChosen(place);setError('');}}
              aria-pressed={chosen===place} className={`block w-full text-left p-3 text-sm ${chosen===place?'bg-blue-50 text-blue-800':'text-slate-700'}`}>
              <strong className="block">{place.name}</strong><span className="text-xs block">{place.address}</span>
              {gps&&place.coords&&<span className="text-[11px] text-blue-700">{formatAddressDistance(place.coords,gps)}</span>}
            </button>)}
          </div>}
          {chosen&&<p className="text-xs text-emerald-700">Endereço selecionado: {chosen.address||chosen.name}</p>}
          {results.length>0&&<p className="text-[11px] text-slate-500">Distância aproximada em linha reta do GPS. O percurso por ruas é calculado ao abrir a rota.</p>}
          <p className="text-[11px] text-slate-500">Os endereços ficam salvos neste aparelho, separados por conta. Não são sincronizados com outros dispositivos.</p>
          <button type="button" onClick={save} disabled={!chosen?.coords||(type==='Outro'&&!custom.trim())}
            className="w-full p-3 rounded-xl bg-emerald-700 text-white font-bold disabled:opacity-50">
            Salvar local
          </button>
        </section>
      </div>,document.body)}
  </div>;
}
