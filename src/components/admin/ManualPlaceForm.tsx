import React, { useEffect, useRef, useState } from 'react';
import { searchLocations, houseNumberNotFoundMessage } from '../../services/locationSearch';
import { parseAdminLocationInput } from '../../services/adminPlaceLocation';
import type { LocationSelection } from '../../types/itinerary';
import { PLACE_KINDS, TOURIST_PLACE_KINDS } from '../../types/admin';
import { buttonClass, inputClass } from './shared';

const blank = (touristOnly = false) => ({ name: '', kind: touristOnly ? 'waterfall' : 'fuel', address: '', lat: '', lng: '', phone: '', website: '', description: '', openingHours: '' });

export function ManualPlaceForm({ busy, onSave, touristOnly = false, onImportReference }: { busy: boolean; onSave: (body: unknown) => Promise<void>; touristOnly?: boolean; onImportReference?: (reference: string) => void }) {
  const [draft, setDraft] = useState(() => blank(touristOnly));
  const [error, setError] = useState(''), [confirmed, setConfirmed] = useState(false);
  const [lookup, setLookup] = useState('');
  const [suggestions, setSuggestions] = useState<LocationSelection[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMessage, setLookupMessage] = useState('');
  const [showAllKinds, setShowAllKinds] = useState(false);
  const generation = useRef(0);
  const selectedLookup = useRef('');
  const update = (key: keyof ReturnType<typeof blank>, value: string) => {
    setDraft(current => ({ ...current, [key]: value }));
    setConfirmed(false);
  };
  const parsed = parseAdminLocationInput(lookup);
  const kinds = PLACE_KINDS.filter(kind => !touristOnly || (TOURIST_PLACE_KINDS as readonly string[]).includes(kind.id));
  const visibleKinds = showAllKinds ? kinds : kinds.filter((kind, index) => index < 8 || kind.id === draft.kind);

  useEffect(() => {
    const query = lookup.trim();
    if (query === selectedLookup.current || query.length < 4 || parsed || /^https?:\/\//i.test(query)) {
      setLookupBusy(false);
      return;
    }
    const requestId = ++generation.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLookupBusy(true);
      try {
        const found = await searchLocations(query, undefined, controller.signal);
        if (requestId !== generation.current) return;
        setSuggestions(found.results);
        setLookupMessage(found.results.length ? 'Selecione abaixo o endereço ou local correto.' :
          found.unmatchedHouseNumber ? houseNumberNotFoundMessage(found.unmatchedHouseNumber) :
          'Nenhum resultado verificado. Inclua rua, número e cidade.');
      } catch (error) {
        if (requestId === generation.current && (error as Error).message !== 'Busca cancelada.')
          setLookupMessage((error as Error).message);
      } finally {
        if (requestId === generation.current) setLookupBusy(false);
      }
    }, 650);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [lookup]);

  const updateLookup = (text: string) => {
    selectedLookup.current = '';
    generation.current++;
    setLookup(text); setSuggestions([]); setLookupBusy(false); setLookupMessage('');
    const parsedInput = parseAdminLocationInput(text);
    if (parsedInput?.type === 'coordinates') {
      setDraft(current => ({ ...current, lat: String(parsedInput.lat), lng: String(parsedInput.lng) }));
      setConfirmed(false);
      setLookupMessage('Coordenadas obtidas de ' + parsedInput.origin + '. Confira o nome, número e endereço antes de publicar.');
    } else if (parsedInput?.type === 'osm-object') {
      setLookupMessage('Ponto do OpenStreetMap encontrado. Use a importação para verificar os dados.');
    } else if (/^https?:\/\//i.test(text.trim())) {
      setLookupMessage('Link sem coordenadas reconhecidas. Use um link completo de mapa ou digite um endereço.');
    }
  };

  const selectSuggestion = (place: LocationSelection) => {
    if (!Array.isArray(place.coords) || !place.coords.every(Number.isFinite)) return;
    generation.current++;
    setDraft(current => ({
      ...current, name: place.name || current.name,
      address: place.address || place.name,
      lat: String(place.coords![0]), lng: String(place.coords![1]),
      kind: kinds.some(kind => kind.id === place.category) ? place.category! : current.kind
    }));
    setConfirmed(false);
    selectedLookup.current = place.name;
    setLookup(place.name); setSuggestions([]);
    setLookupMessage('Local preenchido. Confira todos os dados e escolha o ícone antes de publicar.');
  };

  return <form aria-label="Cadastrar local" className="bg-white border rounded-2xl p-5 space-y-4" onSubmit={async event => {
    event.preventDefault(); setError('');
    try {
      const lat = Number(draft.lat.replace(',', '.')), lng = Number(draft.lng.replace(',', '.'));
      if (!draft.lat.trim() || !draft.lng.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Informe latitude e longitude válidas para o local.');
      await onSave({ ...draft, lat, lng }); setDraft(blank(touristOnly)); setConfirmed(false); setLookup(''); setSuggestions([]); setLookupMessage('');
    } catch (error) { setError((error as Error).message); }
  }}>
    <h3 className="font-bold text-lg">{touristOnly ? 'Cadastrar ponto turístico' : 'Cadastro rápido de local'}</h3>
    <section aria-label="Busca automática do cadastro" className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2">
      <label className="text-sm font-bold block">Buscar endereço, estabelecimento ou colar link de mapa
        <input aria-label="Buscar local automaticamente" value={lookup} onChange={event => updateLookup(event.target.value)}
          maxLength={500} autoComplete="off" placeholder="Rua, número, cidade, coordenadas ou link do mapa"
          className={inputClass + ' bg-white mt-2'} />
      </label>
      <p className="text-xs text-slate-600">Sugestões aparecem ao digitar. Aceita OpenStreetMap, Google Maps, Waze, Apple Maps e coordenadas.</p>
      {lookupBusy && <p role="status" className="text-sm text-emerald-700">Pesquisando endereços...</p>}
      {lookupMessage && <p role="status" className="text-sm text-slate-700">{lookupMessage}</p>}
      {parsed?.type === 'osm-object' && onImportReference && <button type="button"
        className={buttonClass + ' bg-emerald-700 border-emerald-700 text-white'}
        onClick={() => onImportReference(parsed.reference)}>Verificar e importar ponto do OpenStreetMap</button>}
      {!!suggestions.length && <div role="listbox" aria-label="Sugestões de endereços" className="bg-white border rounded-xl shadow-md max-h-64 overflow-y-auto">
        {suggestions.slice(0, 8).map((place, index) => <button key={(place.id || place.name) + index}
          role="option" aria-selected={false} type="button" onClick={() => selectSuggestion(place)}
          className="w-full text-left p-3 border-b last:border-b-0 hover:bg-emerald-50 focus:bg-emerald-50">
          <strong className="block text-sm">{place.name}</strong>
          {place.address && <span className="block text-xs text-slate-500">{place.address}</span>}
        </button>)}
      </div>}
    </section>
    <section aria-label="Selecionar ícone do ponto" className="space-y-2">
      <h4 className="text-sm font-bold">Ícone do ponto no mapa</h4>
      <p className="text-xs text-slate-500">Escolha o tipo. O mapa usa o ícone correspondente à categoria.</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {visibleKinds.map(kind => <button key={kind.id} type="button" aria-pressed={draft.kind === kind.id}
          onClick={() => update('kind', kind.id)} className={'min-h-16 rounded-xl border-2 p-2 flex items-center gap-2 text-left text-sm ' +
          (draft.kind === kind.id ? 'border-emerald-700 bg-emerald-50 font-bold' : 'border-slate-200 bg-white hover:bg-slate-50')}>
          <span className="text-2xl" aria-hidden="true">{kind.icon}</span><span>{kind.label}</span>
        </button>)}
      </div>
      {kinds.length > 8 && <button type="button" className="font-semibold text-emerald-700 text-sm" aria-expanded={showAllKinds}
        onClick={() => setShowAllKinds(value => !value)}>{showAllKinds ? 'Mostrar menos categorias' : 'Ver todas as categorias'}</button>}
    </section>

    <div className="grid md:grid-cols-2 gap-3">
      <label className="text-xs font-semibold">Tipo de local<select aria-label="Tipo de local" value={draft.kind} onChange={event => update('kind', event.target.value)} className={`${inputClass} mt-1`}>{PLACE_KINDS.filter(kind => !touristOnly || (TOURIST_PLACE_KINDS as readonly string[]).includes(kind.id)).map(kind => <option key={kind.id} value={kind.id}>{kind.icon} {kind.label}</option>)}</select></label>
      <label className="text-xs font-semibold">Nome do local<input required maxLength={150} value={draft.name} onChange={event => update('name', event.target.value)} placeholder="Nome do estabelecimento ou atração" className={`${inputClass} mt-1`} /></label>
      <label className="md:col-span-2 text-xs font-semibold">Endereço ou acesso<input required maxLength={250} value={draft.address} onChange={event => update('address', event.target.value)} placeholder="Rua, número, cidade/UF ou estrada de acesso" className={`${inputClass} mt-1`} /></label>
      <label className="text-xs font-semibold">Latitude<input required inputMode="decimal" value={draft.lat} onChange={event => update('lat', event.target.value)} placeholder="Ex.: -23.55052" className={`${inputClass} mt-1`} /></label>
      <label className="text-xs font-semibold">Longitude<input required inputMode="decimal" value={draft.lng} onChange={event => update('lng', event.target.value)} placeholder="Ex.: -46.63331" className={`${inputClass} mt-1`} /></label>
      <label className="text-xs font-semibold">Telefone<input type="tel" maxLength={50} value={draft.phone} onChange={event => update('phone', event.target.value)} className={`${inputClass} mt-1`} /></label>
      <label className="text-xs font-semibold">Site do local<input type="url" maxLength={300} value={draft.website} onChange={event => update('website', event.target.value)} placeholder="https://" className={`${inputClass} mt-1`} /></label>
      <label className="md:col-span-2 text-xs font-semibold">Horário de funcionamento<input maxLength={200} value={draft.openingHours} onChange={event => update('openingHours', event.target.value)} placeholder="Ex.: Seg a sex, das 8h às 18h" className={`${inputClass} mt-1`} /></label>
    </div>
    <p className="text-xs text-slate-500">Copie a latitude e a longitude do ponto no mapa. A posição define onde o local aparece para os viajantes.</p>
    <label className="block text-xs font-semibold">Descrição<textarea maxLength={1000} value={draft.description} onChange={event => update('description', event.target.value)} className={`${inputClass} mt-1`} /></label>
    <label className="flex items-start gap-2 text-xs"><input required type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-0.5" />Conferi o nome, número, endereço, categoria e localização deste local.</label>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    <button disabled={busy} className={`${buttonClass} bg-emerald-600 text-white border-emerald-600`}>{busy ? 'Cadastrando...' : 'Cadastrar e publicar no mapa'}</button>
  </form>;
}
