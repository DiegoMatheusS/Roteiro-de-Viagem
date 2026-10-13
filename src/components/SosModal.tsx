import React, { useState } from 'react';
import { EmergencyContact } from '../types';
import { useDeviceLocation } from '../hooks/useDeviceLocation';
import { 
  AlertOctagon, 
  Phone, 
  Share2, 
  X, 
  MapPin, 
  ShieldAlert, 
  Check, 
  Copy 
} from 'lucide-react';

interface SosModalProps {
  emergencyContacts: EmergencyContact[];
  isOpen: boolean;
  onClose: () => void;
}

export const SosModal: React.FC<SosModalProps> = ({
  emergencyContacts,
  isOpen,
  onClose
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const location = useDeviceLocation(isOpen, 'sos');

  if (!isOpen) return null;

  const canShare = location.status === 'ready' && !!location.position;
  const mapsLink = location.position ? `https://maps.google.com/?q=${location.position.coords[0]},${location.position.coords[1]}` : '';
  const sosMessage = `🚨 Preciso de ajuda na estrada. Esta é minha localização atual: ${mapsLink} · Mensagem enviada pelo aplicativo Roteiro de Viagem.`;

  const handleShareLocationWhatsApp = (phone?: string) => {
    if (!canShare || Date.now() - location.position!.timestamp > 60000) return;
    const cleanPhone = phone ? phone.replace(/\D/g, '') : '';
    const url = cleanPhone 
      ? `https://api.whatsapp.com/send?phone=55${cleanPhone}&text=${encodeURIComponent(sosMessage)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(sosMessage)}`;
    window.open(url, '_blank');
  };

  const handleCopyCoords = async () => {
    if (!canShare || Date.now() - location.position!.timestamp > 60000) return;
    try { await navigator.clipboard.writeText(sosMessage); } catch { return; }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl border border-rose-200 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-4 bg-rose-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertOctagon className="w-6 h-6 animate-pulse" />
            <div>
              <h3 className="text-sm font-black tracking-wide uppercase">
                SOS — Preciso de Ajuda
              </h3>
              <p className="text-[11px] text-rose-100">
                Acesso a socorro rodoviário e contatos familiares.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-rose-700 text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200" role="status">
            {canShare ? `Localização obtida pelo GPS (precisão aproximada: ${Math.round(location.position!.accuracyMeters)} m).` : location.error || 'Buscando sua localização pelo GPS...'}
            {location.error && <button onClick={location.retry} className="block mt-2 text-rose-700 font-bold">Tentar novamente</button>}
          </div>
          {/* Direct Public Emergency Hotlines in Brazil */}
          <div className="space-y-2">
            <span className="font-bold text-slate-800 uppercase tracking-wider block text-[10px]">
              Serviços Públicos de Emergência (Brasil)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <a
                href="tel:190"
                className="p-3 rounded-2xl bg-slate-50 border border-slate-200 hover:border-rose-300 text-slate-900 font-bold flex items-center justify-between transition-colors"
              >
                <div>
                  <span className="block text-rose-700">Polícia Militar</span>
                  <span className="text-base font-extrabold">190</span>
                </div>
                <Phone className="w-4 h-4 text-rose-600" />
              </a>

              <a
                href="tel:191"
                className="p-3 rounded-2xl bg-slate-50 border border-slate-200 hover:border-rose-300 text-slate-900 font-bold flex items-center justify-between transition-colors"
              >
                <div>
                  <span className="block text-rose-700">Polícia Rodoviária</span>
                  <span className="text-base font-extrabold">191</span>
                </div>
                <Phone className="w-4 h-4 text-rose-600" />
              </a>

              <a
                href="tel:192"
                className="p-3 rounded-2xl bg-slate-50 border border-slate-200 hover:border-rose-300 text-slate-900 font-bold flex items-center justify-between transition-colors"
              >
                <div>
                  <span className="block text-rose-700">SAMU (Resgate)</span>
                  <span className="text-base font-extrabold">192</span>
                </div>
                <Phone className="w-4 h-4 text-rose-600" />
              </a>

              <a
                href="tel:193"
                className="p-3 rounded-2xl bg-slate-50 border border-slate-200 hover:border-rose-300 text-slate-900 font-bold flex items-center justify-between transition-colors"
              >
                <div>
                  <span className="block text-rose-700">Bombeiros</span>
                  <span className="text-base font-extrabold">193</span>
                </div>
                <Phone className="w-4 h-4 text-rose-600" />
              </a>
            </div>
          </div>

          {/* Share location with family contacts */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <span className="font-bold text-slate-800 uppercase tracking-wider block text-[10px]">
              Contatos Familiares Cadastrados
            </span>
            {emergencyContacts.length === 0 ? (
              <p className="text-slate-500 italic">Nenhum contato familiar cadastrado nos Ajustes.</p>
            ) : (
              <div className="space-y-2">
                {emergencyContacts.map(c => (
                  <div
                    key={c.id}
                    className="p-3 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-between"
                  >
                    <div>
                      <strong className="text-slate-900 block">{c.name} ({c.relationship})</strong>
                      <span className="text-slate-500 text-[11px]">{c.phone}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <a
                        href={`tel:${c.phone.replace(/\D/g, '')}`}
                        className="p-2 rounded-xl bg-slate-200 text-slate-800 hover:bg-slate-300 transition-colors"
                        title="Ligar"
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => handleShareLocationWhatsApp(c.phone)}
                        disabled={!canShare}
                        className="p-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                        title="Enviar localização no WhatsApp"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Direct Copy Location Link */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <button
              onClick={handleCopyCoords}
              disabled={!canShare}
              className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copiedLink ? 'Mensagem e link do mapa copiados!' : 'Copiar Localização para Enviar'}</span>
            </button>
          </div>

          <p className="text-[10px] text-slate-400 text-center leading-relaxed">
            O SOS é um recurso auxiliar de conveniência e não substitui os canais oficiais de socorro das concessionárias ou autoridades públicas.
          </p>
        </div>
      </div>
    </div>
  );
};
