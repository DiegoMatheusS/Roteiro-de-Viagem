import React from 'react';
import type { RouteToll } from '../types/tolls';
import type { VehicleType } from '../types';
import { TollContribution } from './TollContribution';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
export function TollModal({toll,vehicleType,onClose}: {toll:RouteToll;vehicleType:VehicleType;onClose:()=>void}) {
  useModalScrollLock(true);
  return <div role="dialog" aria-modal="true" aria-label="Tarifas do pedágio" className="fixed inset-0 z-70 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4"><section className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90dvh] overflow-y-auto p-4 space-y-3"><header className="flex items-center justify-between"><h2 className="font-bold text-sm">Pedágio colaborativo</h2><button aria-label="Fechar pedágio" onClick={onClose} className="p-2 text-xl">×</button></header><TollContribution toll={toll} vehicleType={vehicleType} initialOpen /></section></div>;
}
