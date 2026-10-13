import React, { useRef } from 'react';
import { LocationSearch } from './LocationSearch';
import type { MandatoryStop } from '../types/itinerary';

export function moveStop(stops: MandatoryStop[], fromId: string, toId: string) {
  const from = stops.findIndex(stop => stop.id === fromId), to = stops.findIndex(stop => stop.id === toId);
  if (from < 0 || to < 0 || from === to) return stops;
  const ordered = [...stops], [item] = ordered.splice(from, 1); ordered.splice(to, 0, item); return ordered;
}
export function ManualStopsEditor({ value, onChange, bias, hideAddButton = false }: { value: MandatoryStop[]; onChange: (value: MandatoryStop[]) => void; bias?: [number, number]; hideAddButton?: boolean }) {
  const dragging = useRef<string | null>(null), pointerTarget = useRef<string | null>(null);
  return <div className="space-y-3">{value.map((stop, index) => <div key={stop.id} data-stop-id={stop.id} className="bg-slate-50 border rounded-2xl p-3 space-y-2" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (dragging.current) onChange(moveStop(value, dragging.current, stop.id)); dragging.current = null; }}>
    <div className="flex justify-between items-center gap-2"><span className="text-[11px] font-bold text-slate-500">{index + 1} · Parada obrigatória</span><div className="flex gap-3 text-xs"><button type="button" draggable aria-label={`Arrastar parada ${index + 1}`} className="cursor-grab touch-none px-2" onDragStart={e => { dragging.current = stop.id; e.dataTransfer.setData('text/plain', stop.id); }} onDragEnd={() => { dragging.current = null; }} onPointerDown={e => { dragging.current = stop.id; pointerTarget.current = stop.id; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (!dragging.current) return; const item = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-stop-id]'); if (item) pointerTarget.current = item.getAttribute('data-stop-id'); }} onPointerUp={() => { if (dragging.current && pointerTarget.current) onChange(moveStop(value, dragging.current, pointerTarget.current)); dragging.current = null; }}>☰</button>
      <button type="button" disabled={index === 0} aria-label={`Subir parada ${index + 1}`} onClick={() => onChange(moveStop(value, stop.id, value[index - 1].id))}>↑</button><button type="button" disabled={index === value.length - 1} aria-label={`Descer parada ${index + 1}`} onClick={() => onChange(moveStop(value, stop.id, value[index + 1].id))}>↓</button><button type="button" aria-label={`Remover parada ${index + 1}`} className="text-rose-700" onClick={() => onChange(value.filter(item => item.id !== stop.id))}>Remover</button></div></div>
    <LocationSearch label={`Parada ${index + 1}`} value={stop.location} bias={bias} onChange={location => onChange(value.map(item => item.id === stop.id ? { ...item, location } : item))} />
    <label className="flex flex-wrap items-center gap-2 text-xs text-slate-500">Permanência opcional (min)<input aria-label={`Permanência na parada ${index + 1}`} type="number" min={0} max={1440} value={stop.stayMinutes || ''} placeholder="0" onChange={e => onChange(value.map(item => item.id === stop.id ? { ...item, stayMinutes: Number(e.target.value) } : item))} className="w-20 border rounded-lg p-2" /></label>
  </div>)}
    {!hideAddButton && <button type="button" disabled={value.length >= 12} className="text-sm font-bold text-emerald-700 disabled:opacity-50" onClick={() => onChange([...value, { id: crypto.randomUUID(), location: { name: '' }, stayMinutes: 0 }])}>+ Adicionar parada</button>}
    {value.length > 0 && <p className="text-[11px] text-slate-500">Arraste ☰ ou use as setas. As paradas só serão removidas por você.</p>}
  </div>;
}
