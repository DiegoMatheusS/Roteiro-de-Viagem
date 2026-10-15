import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { PLACE_KINDS, type Place } from '../types/admin';
import { PlaceComments } from './PlaceComments';

export function PlaceModal({ place, onClose }: { place: Place; onClose: () => void }) {
  useModalScrollLock();
  return createPortal(<div role="dialog" aria-modal="true" aria-label="Estabelecimento" className="fixed inset-0 z-80 bg-slate-900/60 flex items-end sm:items-center justify-center sm:p-4"><section className="bg-white w-full max-w-xl max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 space-y-4 text-sm"><header className="flex justify-between gap-3"><div><h2 className="font-bold">{PLACE_KINDS.find(k => k.id === place.kind)?.icon} {place.name}</h2><p className="text-xs text-slate-500 mt-1">{place.address || 'Endereço não informado no mapa'}</p></div><button onClick={onClose} aria-label="Fechar estabelecimento"><X className="w-5 h-5" /></button></header><p>{place.description}</p>{place.phone && <p>Telefone: {place.phone}</p>}{place.openingHours && <p className="text-xs text-slate-500">Horário informado: {place.openingHours}</p>}<div className="flex gap-4 text-xs text-emerald-700">{place.website && <a href={place.website} target="_blank" rel="noopener noreferrer" className="underline">Site do estabelecimento</a>}<a href={place.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">Ver localização no mapa</a></div><PlaceComments placeId={place.id} /></section></div>, document.body);
}
