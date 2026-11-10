import React,{useEffect,useRef,useState} from 'react';
import {MapPin} from 'lucide-react';
import {createPortal} from 'react-dom';
import type L from 'leaflet';
import type {LocationSelection} from '../types/itinerary';
import {searchLocations} from '../services/locationSearch';
import {manuallySelectedAddress,streetQueryForManualPin} from '../services/manualAddressPin';
import {requestedHouseNumber} from '../services/locationSuggestions';
import {normalizePostcode,parseAddressParts} from '../services/addressDetails';

/** The street result positions the map, but is never accepted as a delivery point.
 * A stationary center pin marks the user's chosen map center after a gesture. */
export function ManualAddressMapPicker({query,bias,reference,onConfirm,onCancel}:{
  query:string;
  bias?:[number,number];
  reference?:LocationSelection;
  onConfirm:(selection:LocationSelection)=>void;
  onCancel:()=>void;
}) {
  const streetQuery=streetQueryForManualPin(query);
  const [references,setReferences]=useState<LocationSelection[]>([]);
  const [anchor,setAnchor]=useState<LocationSelection|null>(null);
  const [point,setPoint]=useState<[number,number]|null>(null);
  const [number,setNumber]=useState(requestedHouseNumber(query)??'');
  const [postcode,setPostcode]=useState(parseAddressParts(query).postcode??'');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const container=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{
    if(!streetQuery){setError('Informe ao menos o nome da rua antes de marcar no mapa.');return;}
    const controller=new AbortController();
    setBusy(true);setError('');setReferences([]);setAnchor(null);setPoint(null);
    if(reference?.coords){setReferences([reference]);setAnchor(reference);setBusy(false);return()=>controller.abort();}
    const fallback=()=>setAnchor({name:'Escolha a região no mapa',coords:bias??[-14,-52],category:bias?'reference':'overview',requiresPin:true});
    void searchLocations(streetQuery,bias,controller.signal).then(result=>{
      if(controller.signal.aborted)return;
      const candidates=result.results.filter(item=>item.coords).slice(0,8);
      setReferences(candidates);setAnchor(candidates[0]??null);
      if(!candidates.length){fallback();setError('Endereço ainda não cadastrado. Escolha o ponto no mapa para guardar.');}
    }).catch(err=>{if(!controller.signal.aborted){fallback();setError((err as Error).message);}})
      .finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return ()=>controller.abort();
  },[streetQuery,reference?.coords?.[0],reference?.coords?.[1]]);

  useEffect(()=>{
    if(!anchor?.coords||!container.current)return;
    let disposed=false;
    let map:L.Map|null=null;
    let resize:ReturnType<typeof setTimeout>|undefined;
    // Import Leaflet only in the browser: server-side and Node tests have no window.
    void import('leaflet').then(({default:leaflet})=>{
      if(disposed||!container.current)return;
      const active=leaflet.map(container.current,{zoomControl:true}).setView(anchor.coords!,anchor.category==='overview'?4:17);
      map=active;
      leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
        attribution:'© OpenStreetMap contributors',maxZoom:19
      }).addTo(active);
      // The pin stays centered while the user drags/zooms the map underneath it.
      // Never treat the initial street centroid as a confirmed address.
      let interacted=false;
      const updateCenter=()=>{
        if(!interacted)return;
        const center=active.getCenter();
        setPoint([center.lat,center.lng]);
      };
      active.on('dragstart zoomstart',()=>{interacted=true;setPoint(null);});
      active.on('moveend',updateCenter);
      active.on('click',event=>{
        interacted=true;setPoint(null);
        const tapped=event.latlng;
        if(active.getCenter().distanceTo(tapped)<0.5)updateCenter();
        else active.panTo(tapped,{animate:false});
      });
      resize=setTimeout(()=>active.invalidateSize(),100);
    }).catch(()=>{if(!disposed)setError('Não foi possível abrir o mapa agora. Tente novamente.');});
    return ()=>{disposed=true;if(resize)clearTimeout(resize);map?.remove();};
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
          Arraste o mapa até deixar o pino azul sobre a entrada do imóvel, como no Uber. O número é opcional. O ponto é escolhido por você, não confirmado automaticamente pelo buscador.
        </p>
        <p className="text-xs font-semibold text-slate-800 break-words">Endereço informado: {query}</p>
        {busy&&<p role="status" className="text-sm">Procurando a rua no mapa...</p>}
        {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
        {references.length>1&&<label className="block text-sm font-semibold text-slate-800">
          Rua encontrada — escolha a referência
          <select className="mt-1 block w-full border p-3 rounded-xl" value={String(anchor?references.indexOf(anchor):-1)}
            onChange={event=>{setAnchor(references[Number(event.target.value)]??null);setPoint(null);}}>
            {references.map((item,index)=><option key={item.id??index} value={String(index)}>
              {item.address||item.name}
            </option>)}
          </select>
        </label>}
        {anchor?.coords&&<div className="relative w-full h-[min(47dvh,350px)] rounded-xl overflow-hidden border border-slate-200" data-testid="manual-address-map-picker">
          <div ref={container} className="absolute inset-0" aria-label="Mapa para arrastar até o imóvel" data-testid="manual-address-map"/>
          <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center" aria-hidden="true">
            <span className="relative -translate-y-5 drop-shadow-[0_3px_3px_#0f172a70]">
              <MapPin size={41} strokeWidth={2.4} fill="#2563eb" stroke="#ffffff"/>
              <span className="absolute left-[16px] top-[13px] h-2 w-2 rounded-full bg-white"/>
            </span>
            <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-700/40"/>
          </div>
        </div>}
        {anchor?.coords&&<p className="text-xs text-slate-600">
          Arraste o mapa ou toque no imóvel. O pino fica parado no centro; confirme somente quando estiver na posição exata.
        </p>}
        {point&&<>
          <p role="status" className="text-sm font-semibold text-blue-800">
            Pino sobre o imóvel: {point[0].toFixed(6)}, {point[1].toFixed(6)}
          </p>
          <label className="block text-sm font-semibold text-slate-800">
            Número do imóvel (opcional)
            <input type="text" inputMode="text" value={number} maxLength={7}
              onChange={event=>setNumber(event.target.value)}
              placeholder="Digite o número, se souber" aria-label="Número do imóvel"
              className="block mt-1 w-full rounded-xl border p-3 font-normal"/>
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            CEP (opcional)
            <input type="text" inputMode="numeric" value={postcode} maxLength={9} aria-label="CEP do endereço"
              placeholder="00000-000" onChange={event=>setPostcode(event.target.value)}
              className="block mt-1 w-full rounded-xl border p-3 font-normal"/>
          </label>
          <p className="text-xs text-slate-600">
            Se não souber o número, deixe vazio e confirme o ponto que marcou.
          </p>
        </>}
        <button type="button" disabled={!point||Boolean(number.trim()&&!/^\d{1,6}[a-z]?$/i.test(number.trim()))||Boolean(postcode.trim()&&!/^\d{5}-?\d{3}$/.test(postcode.trim()))}
          className="w-full min-h-12 bg-blue-700 text-white font-bold rounded-xl disabled:opacity-40"
          onClick={()=>{if(point){const place=manuallySelectedAddress(query,point,number),zip=normalizePostcode(postcode);
            const base=(place.address||place.name).replace(/\b\d{5}[-\s]?\d{3}\b/g,'').replace(/,\s*,/g,',').replace(/^[,\s]+|[,\s]+$/g,'');
            const address=[base,zip?`${zip.slice(0,5)}-${zip.slice(5)}`:''].filter(Boolean).join(', ')||'Ponto escolhido no mapa';
            onConfirm({...place,name:address.slice(0,150),address,addressParts:{...parseAddressParts(address),...(number.trim()?{houseNumber:number.trim().toLowerCase()}:{}),...(zip?{postcode:zip}:{})}});}}}>
          Confirmar local do pino
        </button>
      </section>
    </div>,document.body);
}
