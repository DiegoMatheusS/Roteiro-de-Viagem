import React, { useMemo, useState } from 'react';
import { ArrowRight, CarFront, MapPin, Users, X } from 'lucide-react';
import type { TripPlan, Vehicle } from '../types';

interface CreateConvoyModalProps {
  trips: TripPlan[];
  vehicle: Vehicle | null;
  signedIn: boolean;
  onClose: () => void;
  onCreate: (trip: TripPlan, title: string) => Promise<boolean>;
  onPlanRoute: () => void;
  onLogin: () => void;
  onOpenProfile: () => void;
}

function isUsableRoadTrip(trip: TripPlan): boolean {
  return trip.status !== 'cancelled' && Array.isArray(trip.routePath) &&
    trip.routePath.length >= 2 && trip.routePath.length <= 2500 &&
    trip.routePath.every(point => Array.isArray(point) && point.length === 2 &&
      Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
      Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180);
}

export function CreateConvoyModal({
  trips, vehicle, signedIn, onClose, onCreate, onPlanRoute, onLogin, onOpenProfile, onJoinCode
}: CreateConvoyModalProps) {
  const available = useMemo(() =>
    trips.filter(isUsableRoadTrip)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), [trips]);
  const [selectedId, setSelectedId] = useState(available[0]?.id || '');
  const selected = available.find(trip => trip.id === selectedId);
  const [title, setTitle] = useState(available[0] ? `Comboio: ${available[0].title}`.slice(0, 100) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !selected || !signedIn || !vehicle) return;
    const normalized = title.trim();
    if (normalized.length < 3 || normalized.length > 100) {
      setError('Dê um nome ao comboio com 3 a 100 caracteres.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await onCreate(selected, normalized);
      if (created) onClose();
      else setError('Não foi possível criar o comboio. Confira os avisos e tente novamente.');
    } catch (failure) {
      setError((failure as Error).message || 'Não foi possível criar o comboio.');
    } finally {
      setBusy(false);
    }
  };

  const leave = (callback: () => void) => {
    if (busy) return;
    onClose();
    callback();
  };
  return (
    <div role="presentation"
      className="fixed inset-0 z-[95] bg-slate-950/55 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label="Criar Comboio"
        onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose(); } }}
        className="bg-white w-full max-w-md rounded-t-[28px] sm:rounded-[26px] max-h-[92dvh] overflow-y-auto shadow-2xl p-5 sm:p-6 pb-[max(22px,env(safe-area-inset-bottom))] animate-[role-dialog-enter_.28s_cubic-bezier(.22,1,.36,1)_both]">
        <div className="flex items-start gap-3 mb-5">
          <span aria-hidden="true" className="w-11 h-11 bg-blue-50 text-blue-700 rounded-2xl flex items-center justify-center shrink-0"><Users size={22}/></span>
          <div className="flex-1 min-w-0">
            <h2 className="text-[21px] tracking-tight font-semibold text-slate-950">Criar Comboio</h2>
            <p className="text-[13px] text-slate-500 mt-0.5">Organize um passeio com seus amigos.</p>
          </div>
          <button type="button" aria-label="Fechar criação de comboio" onClick={onClose} disabled={busy}
            className="w-10 h-10 bg-slate-100 rounded-full text-slate-600 flex items-center justify-center disabled:opacity-50"><X size={19}/></button>
        </div>

        <form onSubmit={event => void submit(event)} className="space-y-4">
          {available.length > 0 ? <>
            <label className="block text-[13px] font-semibold text-slate-700" htmlFor="role-convoy-route">Viagem do comboio
              <select id="role-convoy-route" autoFocus value={selectedId} disabled={busy}
                onChange={event => {
                  const next = available.find(trip => trip.id === event.target.value);
                  setSelectedId(event.target.value);
                  setTitle(next ? `Comboio: ${next.title}`.slice(0, 100) : '');
                  setError('');
                }}
                className="block w-full mt-2 min-h-12 bg-slate-50 rounded-xl border border-slate-200 px-3.5 text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200">
                {available.map(trip => <option key={trip.id} value={trip.id}>{trip.originName} → {trip.destinationName} · {trip.distanceKm.toFixed(0)} km</option>)}
              </select>
            </label>
            <label className="block text-[13px] font-semibold text-slate-700" htmlFor="role-convoy-name">Nome do comboio
              <input id="role-convoy-name" type="text" autoComplete="off" maxLength={100} value={title}
                onChange={event => { setTitle(event.target.value); setError(''); }} disabled={busy}
                placeholder="Ex.: Passeio de domingo"
                className="block w-full mt-2 min-h-12 bg-slate-50 rounded-xl border border-slate-200 px-3.5 text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200"/>
            </label>
            {selected && <div className="flex gap-2 items-start text-xs text-slate-600 bg-slate-50 rounded-xl px-3.5 py-3">
              <MapPin size={17} className="text-blue-700 shrink-0"/>
              <p><strong className="font-semibold text-slate-800">{selected.distanceKm.toFixed(0)} km · {Math.round(selected.durationMinutes)} min</strong>
                <span className="block mt-0.5">Ponto inicial: {selected.originName}</span></p>
            </div>}
          </> : <div className="bg-blue-50 rounded-xl p-4 text-[13px] text-blue-900 space-y-2">
            <p className="font-semibold">Antes, escolha o percurso do comboio.</p>
            <p>Crie uma rota por KM, horas ou origem e destino. Depois ela aparecerá aqui para você selecionar.</p>
            <button type="button" onClick={() => leave(onPlanRoute)}
              className="font-semibold underline underline-offset-2">Planejar uma rota <ArrowRight size={14} className="inline"/></button>
          </div>}

          <p className="text-xs text-slate-600">Os participantes entram pelo código do convite. O compartilhamento da localização começa desligado.</p>
          {error && <p role="alert" className="text-xs text-rose-800 bg-rose-50 border border-rose-100 rounded-xl p-3">{error}</p>}
          {!signedIn ? <button type="button" onClick={() => leave(onLogin)}
            className="w-full min-h-13 rounded-xl bg-blue-600 text-white font-semibold text-sm flex items-center justify-center gap-2">
            Entrar para criar <ArrowRight size={18}/></button>
          : !vehicle ? <button type="button" onClick={() => leave(onOpenProfile)}
            className="w-full min-h-13 rounded-xl bg-blue-600 text-white font-semibold text-sm flex items-center justify-center gap-2">
            <CarFront size={18}/> Cadastrar veículo no Perfil</button>
          : <button type="submit" disabled={busy || !selected || title.trim().length < 3}
            className="w-full min-h-13 rounded-xl bg-blue-600 text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            {busy ? 'Criando comboio...' : 'Criar Comboio'}{!busy && <ArrowRight size={18}/>}
          </button>}
        </form>

      </section>
    </div>
  );
}
