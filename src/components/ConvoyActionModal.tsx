import React from 'react';
import { ArrowRight, KeyRound, Plus, Users, X } from 'lucide-react';

interface ConvoyActionModalProps {
  onClose: () => void;
  onCreate: () => void;
  onJoin: () => void;
}

export function ConvoyActionModal({onClose,onCreate,onJoin}:ConvoyActionModalProps) {
  return (
    <div role="presentation"
      className="fixed inset-0 z-[95] bg-slate-950/55 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
      <section role="dialog" aria-modal="true" aria-label="Opções do comboio"
        onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();onClose();}}}
        className="w-full max-w-md bg-white rounded-t-[28px] sm:rounded-[26px] shadow-2xl p-5 sm:p-6 pb-[max(24px,env(safe-area-inset-bottom))] animate-[role-dialog-enter_.28s_cubic-bezier(.22,1,.36,1)_both]">
        <div className="flex items-start gap-3 mb-5">
          <span aria-hidden="true" className="w-11 h-11 bg-blue-50 text-blue-700 rounded-2xl flex justify-center items-center shrink-0"><Users size={22}/></span>
          <div className="flex-1 min-w-0">
            <h2 className="text-[21px] font-semibold tracking-tight text-slate-950">Comboio</h2>
            <p className="mt-0.5 text-[13px] text-slate-500">Viaje em grupo com seu próprio roteiro.</p>
          </div>
          <button type="button" aria-label="Fechar opções do comboio" onClick={onClose}
            className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"><X size={19}/></button>
        </div>
        <div className="space-y-3">
          <button autoFocus type="button" onClick={onCreate}
            className="w-full min-h-[68px] rounded-[18px] border border-blue-200 bg-blue-50/60 px-4 py-3 text-left flex items-center gap-3 transition-colors hover:bg-blue-100/80">
            <span aria-hidden="true" className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0"><Plus size={22}/></span>
            <span className="flex-1 min-w-0"><strong className="block text-[15px] font-semibold text-slate-900">Criar comboio</strong><small className="block text-xs text-slate-600 mt-0.5">Escolher uma viagem e convidar pessoas</small></span>
            <ArrowRight size={19} className="text-blue-700 shrink-0" aria-hidden="true"/>
          </button>
          <button type="button" onClick={onJoin}
            className="w-full min-h-[68px] rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-left flex items-center gap-3 transition-colors hover:bg-slate-50">
            <span aria-hidden="true" className="w-11 h-11 rounded-full bg-slate-100 text-blue-700 flex items-center justify-center shrink-0"><KeyRound size={21}/></span>
            <span className="flex-1 min-w-0"><strong className="block text-[15px] font-semibold text-slate-900">Entrar no comboio</strong><small className="block text-xs text-slate-600 mt-0.5">Tenho um código de convite</small></span>
            <ArrowRight size={19} className="text-slate-500 shrink-0" aria-hidden="true"/>
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-4">Compartilhar sua localização é opcional e começa desativado.</p>
      </section>
    </div>
  );
}
