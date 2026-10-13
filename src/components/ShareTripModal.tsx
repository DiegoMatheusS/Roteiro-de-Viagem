import React, { useState } from 'react';
import { TripPlan, Vehicle } from '../types';
import { fuelApi } from '../services/fuelApi';
import { sampleRoutePath } from '../types/itinerary';
import { convoyService } from '../services/convoyService';
import { 
  Share2, 
  Users, 
  Copy, 
  Check, 
  X, 
  ShieldCheck, 
  MessageSquare, 
  MapPin, 
  ArrowRight,
  Flag
} from 'lucide-react';

interface ShareTripModalProps {
  trip: TripPlan;
  currentVehicle?: Vehicle | null;
  currentUserId: string;
  currentUserName: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenConvoy: (convoyId: string) => void;
}

export const ShareTripModal: React.FC<ShareTripModalProps> = ({
  trip,
  currentVehicle,
  currentUserId,
  currentUserName,
  isOpen,
  onClose,
  onOpenConvoy
}) => {
  const [selectedMode, setSelectedMode] = useState<'menu' | 'share_route' | 'create_convoy'>('menu');
  const [copiedLink, setCopiedLink] = useState(false);
  const [sanitizeHome, setSanitizeHome] = useState(true);
  const [shareUrl, setShareUrl] = useState(''), [shareError, setShareError] = useState(''), [shareBusy, setShareBusy] = useState(false);

  // Convoy creation form
  const [convoyTitle, setConvoyTitle] = useState(`Comboio: ${trip.title}`);
  const [firstMeetingPointName, setFirstMeetingPointName] = useState('Posto de Combustível da Saída');
  const [convoyNotes, setConvoyNotes] = useState('Pilotagem tranquila em grupo. Manter faróis acesos.');

  if (!isOpen) return null;

  const payload = convoyService.generateRouteSharePayload(trip, sanitizeHome, shareUrl);
  const whatsAppUrl = convoyService.getWhatsAppShareUrl(payload);

  const generateLink = async () => {
    setShareBusy(true); setShareError('');
    try {
      const result = await fuelApi<{ id: string }>('/routes/share', { method: 'POST', body: JSON.stringify({ protectOrigin: sanitizeHome, trip: { title: trip.title, originName: trip.originName, destinationName: trip.destinationName, originCoords: trip.originCoords, destinationCoords: trip.destinationCoords, routePath: sampleRoutePath(trip.routePath, 400), distanceKm: trip.distanceKm, durationMinutes: trip.durationMinutes, stops: trip.stops, routingSource: trip.routingSource } }) });
      setShareUrl(`${window.location.origin}/#roteiro=${result.id}`);
    } catch (error) { setShareError((error as Error).message); } finally { setShareBusy(false); }
  };
  const handleCopyLink = async () => {
    try { await navigator.clipboard.writeText(shareUrl); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2500); }
    catch { setShareError('Não foi possível copiar. Selecione e copie o link exibido.'); }
  };

  const handleCreateConvoy = () => {
    const newConvoy = convoyService.createConvoy({
      title: convoyTitle,
      trip,
      organizerUser: {
        id: currentUserId,
        name: currentUserName,
        vehicleType: currentVehicle?.type || 'motorcycle',
        vehicleNickname: currentVehicle?.nickname || currentVehicle?.model
      },
      meetingPoints: [
        {
          id: `mp-${Date.now()}`,
          title: firstMeetingPointName.trim() || 'Ponto de Encontro Inicial',
          category: 'posto',
          coords: trip.routePath[1] || trip.originCoords,
          description: 'Ponto de partida e reunião dos participantes.',
          order: 1,
          confirmedArrivedParticipantIds: [currentUserId]
        }
      ],
      notes: convoyNotes
    });

    onClose();
    onOpenConvoy(newConvoy.id);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Compartilhar viagem" className="fixed inset-0 z-60 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in">
      <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            {selectedMode !== 'menu' && (
              <button 
                onClick={() => setSelectedMode('menu')}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors mr-1"
              >
                ← Voltar
              </button>
            )}
            <h3 className="text-base font-bold text-slate-900">
              {selectedMode === 'menu' && 'Opções de Compartilhamento'}
              {selectedMode === 'share_route' && 'Compartilhar Rota'}
              {selectedMode === 'create_convoy' && 'Criar Comboio de Viagem'}
            </h3>
          </div>
          <button 
            aria-label="Fechar compartilhamento"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* MENU SELECTION */}
          {selectedMode === 'menu' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Escolha como deseja compartilhar este roteiro com amigos ou grupo de viagem:
              </p>

              {/* Option 1: Compartilhar Rota */}
              <button
                onClick={() => setSelectedMode('share_route')}
                className="w-full p-4 rounded-2xl border border-slate-200 hover:border-emerald-500 bg-white hover:bg-emerald-50/30 text-left transition-all group flex items-start gap-4"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Share2 className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900 group-hover:text-emerald-800">
                      Compartilhar Rota
                    </h4>
                    <span className="text-xs text-emerald-600 font-medium">Link público</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Envie este roteiro para outra pessoa. Inclui paradas, quilometragem e mapa planejado. Não transmite sua localização em tempo real.
                  </p>
                </div>
              </button>

              {/* Option 2: Comboio de Viagem */}
              <button
                onClick={() => setSelectedMode('create_convoy')}
                className="w-full p-4 rounded-2xl border border-slate-200 hover:border-violet-500 bg-white hover:bg-violet-50/30 text-left transition-all group flex items-start gap-4"
              >
                <div className="w-12 h-12 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Users className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900 group-hover:text-violet-800">
                      Comboio de Viagem
                    </h4>
                    <span className="text-xs text-violet-600 font-medium">Viagem em grupo</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Viaje em grupo e acompanhe os participantes no mapa. Defina pontos de encontro compartilhados e acompanhe apenas quem autorizar localização ao vivo.
                  </p>
                </div>
              </button>

              {/* Note on Family Sharing separation */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-2 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  O acompanhamento familiar e avisos de chegada funcionam de maneira separada nas configurações de segurança.
                </span>
              </div>
            </div>
          )}

          {/* SHARE ROUTE VIEW */}
          {selectedMode === 'share_route' && (
            <div className="space-y-5">
              {/* Route Summary Card */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="text-xs font-semibold text-slate-400">RESUMO DO ROTEIRO</div>
                <div className="text-sm font-bold text-slate-900">{trip.title}</div>
                <div className="text-xs text-slate-600 flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{payload.originName}</span>
                  <ArrowRight className="w-3 h-3 text-slate-400" />
                  <span>{payload.destinationName}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-600 pt-2 border-t border-slate-200">
                  <span>Distância: <strong className="text-slate-900">{trip.distanceKm} km</strong></span>
                  <span>·</span>
                  <span>Duração: <strong className="text-slate-900">{Math.floor(trip.durationMinutes / 60)}h{trip.durationMinutes % 60}min</strong></span>
                  <span>·</span>
                  <span>Paradas: <strong className="text-slate-900">{trip.stops.length}</strong></span>
                </div>
              </div>

              {/* Privacy protection toggle */}
              <label className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50/50 border border-emerald-100 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={sanitizeHome}
                  onChange={(e) => { setSanitizeHome(e.target.checked); setShareUrl(''); }}
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <div className="text-xs text-slate-700">
                  <span className="font-semibold block text-emerald-950">Proteger endereço residencial</span>
                  Aproxima a origem e oculta o trecho inicial próximo a ela. As demais paradas escolhidas serão compartilhadas.
                </div>
              </label>

              {shareError && <p role="alert" className="text-xs text-rose-700">{shareError}</p>}
              <button disabled={shareBusy} onClick={generateLink} className="w-full py-3 border rounded-xl text-emerald-700 text-xs font-bold">{shareBusy ? 'Gerando link...' : shareUrl ? 'Gerar novo link do roteiro' : 'Gerar link do roteiro'}</button>
              {shareUrl && <label className="block text-xs text-slate-500">Link válido por 90 dias<input aria-label="Link do roteiro" readOnly value={shareUrl} className="w-full border rounded-xl p-3 mt-1" /></label>}
              {/* Action Buttons */}
              <div className="space-y-3 pt-2">
                <a
                  href={shareUrl ? whatsAppUrl : undefined}
                  aria-disabled={!shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  <MessageSquare className="w-4 h-4" />
                  Compartilhar no WhatsApp
                </a>

                <button
                  disabled={!shareUrl || shareBusy}
                  onClick={handleCopyLink}
                  className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {copiedLink ? 'Link copiado para a área de transferência!' : 'Copiar Link do Roteiro'}
                </button>
              </div>

              <div className="text-[11px] text-slate-400 text-center leading-normal">
                Quem abrir o link poderá visualizar o percurso e todas as paradas escolhidas. O compartilhamento não transmite localização ao vivo.
              </div>
            </div>
          )}

          {/* CREATE CONVOY VIEW */}
          {selectedMode === 'create_convoy' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome do Comboio
                </label>
                <input 
                  type="text"
                  value={convoyTitle}
                  onChange={(e) => setConvoyTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-violet-500"
                  placeholder="Ex: Comboio dos Amigos para Campos do Jordão"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Primeiro Ponto de Encontro
                </label>
                <div className="relative">
                  <Flag className="w-4 h-4 text-violet-600 absolute left-3 top-2.5" />
                  <input 
                    type="text"
                    value={firstMeetingPointName}
                    onChange={(e) => setFirstMeetingPointName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-violet-500"
                    placeholder="Ex: Posto Graal km 125, Restaurante da Serra"
                  />
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Os participantes poderão marcar "Cheguei ao ponto de encontro" sem precisar transmitir localização contínua.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Instruções e Recados do Líder
                </label>
                <textarea 
                  rows={2}
                  value={convoyNotes}
                  onChange={(e) => setConvoyNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-violet-500 resize-none"
                  placeholder="Orientações sobre paradas, velocidade do grupo, etc."
                />
              </div>

              <div className="p-3 rounded-xl bg-violet-50 border border-violet-100 text-xs text-violet-900 space-y-1">
                <span className="font-bold block">Privacidade e Localização:</span>
                <p className="text-[11px] leading-relaxed text-violet-800">
                  O compartilhamento de localização em tempo real inicia <strong>desativado por padrão</strong> para todos os participantes. Cada motociclista/motorista deve autorizar explicitamente se quiser aparecer no mapa do grupo.
                </p>
              </div>

              <button
                onClick={handleCreateConvoy}
                className="w-full py-3 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <Users className="w-4 h-4" />
                Criar Comboio e Convidar Amigos
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
