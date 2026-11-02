import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import L from 'leaflet';
import type {LocationSelection} from '../types/itinerary';
import {searchLocations} from '../services/locationSearch';
import {manuallySelectedAddress,streetQueryForManualPin} from '../services/manualAddressPin';
import {requestedHouseNumber} from '../services/locationSuggestions';

/** The map only uses a street result as a starting viewport. The traveler must
 * tap the actual building before any coordinates can be accepted. */
export function ManualAddressMapPicker({query,bias,onConfirm,onCancel}:{
  query:string;
  bias?:[number,number];
  onConfirm:(selection:LocationSelection)=>void;
  onCancel:()=>void;
}) {
  const streetQuery=streetQueryForManualPin(query);
  const [references,setReferences]=useState<LocationSelection[]>([]);
  const [anchor,setAnchor]=useState<LocationSelection|null>(null);
  const [point,setPoint]=useState<[number,number]|null>(null);
  const [number,setNumber]=useState(requestedHouseNumber(query)??'');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const container=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{
    if(!streetQuery){setError('Informe rua e número antes de marcar no mapa.');return;}
    const controller=new AbortController();
    setBusy(true);setError('');setReferences([]);setAnchor(null);setPoint(null);
    void searchLocations(streetQuery,bias,controller.signal).then(result=>{
      if(controller.signal.aborted)return;
      const candidates=result.results.filter(item=>item.coords).slice(0,8);
      setReferences(candidates);setAnchor(candidates[0]??null);
      if(!candidates.length)setError('Não encontramos essa rua. Inclua a cidade no endereço e tente novamente.');
    }).catch(err=>{if(!controller.signal.aborted)setError((err as Error).message);})
      .finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return ()=>controller.abort();
  },[streetQuery]);

  useEffect(()=>{
    if(!anchor?.coords||!container.current)return;
    const map=L.map(container.current,{zoomControl:true}).setView(anchor.coords,17);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© OpenStreetMap contributors',maxZoom:19
    }).addTo(map);
    let pin:L.CircleMarker|null=null;
    map.on('click',event=>{
      const coords:[number,number]=[event.latlng.lat,event.latlng.lng];
      pin?.remove();
      pin=L.circleMarker(coords,{radius:9,color:'#1d4ed8',weight:3,fillColor:'#60a5fa',fillOpacity:0.9}).addTo(map);
      setPoint(coords);
    });
    const resize=setTimeout(()=>map.invalidateSize(),100);
    return ()=>{clearTimeout(resize);map.remove();};
  },[anchor?.coords?.[0],anchor?.coords?.[1]]);

  return createPortal(
    <div className="fixed inset-0 z-[310] bg-slate-950/70 flex items-center justify-center p-3"
      role="presentation">
      <section role="dialog" aria-modal="true" aria-label="Marcar endereço no mapa"
        className="bg-white w-full max-w-xl rounded-2xl p-4 shadow-2xl space-y-3 max-h-[95dvh] overflow-y-auto">
        <header className="flex justify-between gap-3 items-center">
          <h2 className="font-extrabold text-lg text-slate-900">Marcar endereço no mapa</h2>
          <button type="button" onClick={onCancel} aria-label="Fechar mapa"
            className="rounded-lg border px-3 py-2 font-bold">Fechar</button>
        </header>
        <p className="text-sm text-slate-700">
          Caso não saiba o número ou ele não apareça na pesquisa, escolha a rua correta
          e toque no ponto exato do endereço. A posição será marcada por você, não verificada automaticamente.
        </p>
        <p className="text-xs font-semibold text-slate-800 break-words">Endereço informado: {query}</p>
        {busy&&<p role="status" className="text-sm">Procurando a rua no mapa...</p>}
        {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
        {references.length>1&&<label className="block text-sm font-semibold text-slate-800">
          Referência para abrir o mapa
          <select className="mt-1 block w-full border p-3 rounded-xl" value={anchor?.id??''}
            onChange={event=>{setAnchor(references.find(p=>p.id===event.target.value)??null);setPoint(null);}}>
            {references.map((item,index)=><option key={item.id??index} value={item.id??''}>
              {item.address||item.name}
            </option>)}
          </select>
        </label>}
        {anchor?.coords&&<div ref={container} className="w-full h-[min(47dvh,350px)] rounded-xl overflow-hidden border"
          aria-label="Mapa para escolher a posição do imóvel" data-testid="manual-address-map"/>}
        {anchor?.coords&&<p className="text-xs text-slate-600">
          Amplie o mapa e toque no imóvel correto para colocar o marcador azul.
        </p>}
        {point&&<>
          <p role="status" className="text-sm font-semibold text-blue-800">
            Ponto selecionado: {point[0].toFixed(6)}, {point[1].toFixed(6)}
          </p>
          <label className="block text-sm font-semibold text-slate-800">
            Número do imóvel (opcional)
            <input type="text" inputMode="text" value={number} maxLength={7}
              onChange={event=>setNumber(event.target.value)}
              placeholder="Digite o número, se souber" aria-label="Número do imóvel"
              className="block mt-1 w-full rounded-xl border p-3 font-normal"/>
          </label>
          <p className="text-xs text-slate-600">
            Se não souber o número, deixe vazio e confirme o ponto que marcou.
          </p>
        </>}
        <button type="button" disabled={!point||Boolean(number.trim()&&!/^\d{1,6}[a-z]?$/i.test(number.trim()))}
          className="w-full min-h-12 bg-blue-700 text-white font-bold rounded-xl disabled:opacity-40"
          onClick={()=>{if(point)onConfirm(manuallySelectedAddress(query,point,number));}}>
          Confirmar localização marcada
        </button>
      </section>
    </div>,document.body);
}
