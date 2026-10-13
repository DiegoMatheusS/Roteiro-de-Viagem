import React, { useRef, useState } from 'react';
import { fuelApi } from '../services/fuelApi';
import type { LocationSelection } from '../types/itinerary';

export function LocationSearch({ label, value, onChange, bias, placeholder }: { label: string; value: LocationSelection; onChange: (value: LocationSelection) => void; bias?: [number, number]; placeholder?: string }) {
  const [results, setResults] = useState<LocationSelection[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const search = async () => {
    const current = ++generation.current;
    setBusy(true); setError(''); setResults([]);
    try {
      const result = await fuelApi<{ results: LocationSelection[]; unavailable?: boolean }>(`/locations/search?q=${encodeURIComponent(value.name)}${bias ? `&lat=${bias[0]}&lng=${bias[1]}` : ''}`);
      if (current !== generation.current) return;
      setResults(result.results);
      if (!result.results.length) setError('Nenhum local encontrado. Inclua a cidade ou o endereço.');
      else if (result.unavailable) setError('Busca externa indisponível; exibindo locais já verificados.');
    } catch (error) { if (current === generation.current) setError((error as Error).message); }
    finally { if (current === generation.current) setBusy(false); }
  };
  return <div className="space-y-2"><label className="block text-xs font-bold text-slate-700">{label}<div className="flex gap-2 mt-1"><input aria-label={label} value={value.name} placeholder={placeholder || 'Cidade, endereço ou estabelecimento'} maxLength={150} onChange={e => { generation.current++; setBusy(false); setResults([]); setError(''); onChange({ name: e.target.value }); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); search(); } }} className="border border-slate-200 rounded-xl p-3 text-sm w-full min-w-0" /><button type="button" disabled={busy || value.name.trim().length < 3} onClick={search} aria-label={`Buscar ${label.toLowerCase()}`} className="border rounded-xl px-3 text-xs font-bold text-emerald-700 disabled:opacity-50">{busy ? '...' : 'Buscar'}</button></div></label>
    {value.coords && <p className="text-[11px] text-emerald-700">✓ Localização definida {value.sourceUrl && <a href={value.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline ml-1">Ver no mapa</a>}</p>}
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    {results.length > 0 && <div className="border rounded-xl overflow-hidden bg-white">{results.map(result => <button key={result.id} type="button" onClick={() => { generation.current++; setResults([]); setError(''); onChange(result); }} className="block text-left w-full p-3 border-b last:border-0 hover:bg-emerald-50 text-xs"><strong className="block">{result.name}</strong><span className="text-slate-500">{result.address}</span></button>)}<p className="text-[10px] p-2 text-slate-500">Dados © OpenStreetMap · busca Photon</p></div>}
  </div>;
}
