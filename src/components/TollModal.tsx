import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { RouteToll } from '../types/tolls';
import type { VehicleType } from '../types';
import { TollContribution } from './TollContribution';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { PlaceComments } from './PlaceComments';
export function TollModal({toll,vehicleType,onClose,initialSection='prices'}: {toll:RouteToll;vehicleType:VehicleType;onClose:()=>void;initialSection?:'prices'|'comments'}) {
  useModalScrollLock(true);
  const [section,setSection]=useState(initialSection);
  return createPortal(<div role="dialog" aria-modal="true" aria-label="Tarifas do pedágio" className="fixed inset-0 z-80 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4"><section className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90dvh] overflow-y-auto p-4 space-y-3"><header className="flex items-center justify-between"><div><h2 className="font-bold text-sm">Pedágio colaborativo</h2><p className="text-xs text-slate-500">{toll.name}</p></div><button aria-label="Fechar pedágio" onClick={onClose} className="p-2 text-xl">×</button></header><nav aria-label="Opções do pedágio" className="flex gap-2"><button type="button" aria-pressed={section==='prices'} onClick={()=>setSection('prices')} className={`rounded-xl px-4 py-2 text-xs font-bold ${section==='prices'?'bg-emerald-600 text-white':'border'}`}>Tarifas</button><button type="button" aria-pressed={section==='comments'} onClick={()=>setSection('comments')} className={`rounded-xl px-4 py-2 text-xs font-bold ${section==='comments'?'bg-emerald-600 text-white':'border'}`}>Comentários</button></nav>{section==='comments'?<PlaceComments placeId={toll.id} title="Comentários do pedágio" />:<TollContribution toll={toll} vehicleType={vehicleType} initialOpen />}</section></div>,document.body);
}
