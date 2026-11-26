import { isFreshSosLocation,whatsAppSosUrl,openSosLink,copySosMessage,normalizeContactPhone } from '../services/sos';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { EmergencyContact } from '../types';
import { useDeviceLocation } from '../hooks/useDeviceLocation';
import { fuelApi, FuelApiError } from '../services/fuelApi';
import { isFreshGpsFix } from '../services/gpsFreshness';
import type { DeviceLocation } from '../services/locationService';
import { POLICE_ROUTE_BLUE, POLICE_ROUTE_RED, type PoliceRoute } from '../types/policeRoute';
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
  policeNavigation?: {
    tripId: string;
    route?: PoliceRoute;
    onRouteChange: (route: PoliceRoute | null) => void;
  };
}

function PoliceRouteAction({ navigation, position, onClose }: {
  navigation: NonNullable<SosModalProps['policeNavigation']>;
  position: DeviceLocation | null;
  onClose: () => void;
}) {
  const request = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useLayoutEffect(() => () => request.current?.abort(), []);
  const hasPreciseLocation = (fix: DeviceLocation | null) =>
    fix && isFreshGpsFix(fix.timestamp) && fix.accuracyMeters <= 150;
  const search = async () => {
    if (request.current) return;
    if (!position || !hasPreciseLocation(position)) {
      setError('Aguarde uma localização recente e precisa do GPS.');
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setError('');
    setLoading(true);
    try {
      const route = await fuelApi<PoliceRoute>('/sos/police-route', {
        method: 'POST',
        body: JSON.stringify({ originCoords: position.coords }),
        signal: controller.signal
      });
      if (controller.signal.aborted) return;
      if (!route?.station || !Array.isArray(route.routePath) || route.routePath.length < 2) {
        throw new Error('Rota policial indisponível.');
      }
      navigation.onRouteChange(route);
      onClose();
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof FuelApiError ? error.message :
        'Não foi possível traçar a rota policial. Confira a conexão e tente novamente.');
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setLoading(false);
      }
    }
  };
  return <div className="space-y-2">
    <button type="button" className="flex w-full min-h-12 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-white disabled:opacity-60"
      style={{ backgroundImage: `linear-gradient(105deg, ${POLICE_ROUTE_BLUE} 38%, #991b1b 66%, ${POLICE_ROUTE_RED})` }}
      disabled={loading || (!navigation.route && !hasPreciseLocation(position))}
      aria-busy={loading}
      onClick={() => {
        if (navigation.route) { navigation.onRouteChange(null); onClose(); }
        else void search();
      }}>
      <ShieldAlert size={19} aria-hidden="true"/>
      {loading ? 'Buscando delegacia ou posto…' : navigation.route ? 'Remover rota policial' : 'Rota até a polícia mais próxima'}
    </button>
    {!navigation.route && !hasPreciseLocation(position) &&
      <p className="text-slate-600">Aguardando GPS preciso para traçar a rota policial.</p>}
    {error && <p role="alert" className="text-rose-700">{error}</p>}
  </div>;
}

export const SosModal: React.FC<SosModalProps> = ({
  emergencyContacts,
  isOpen,
  onClose,
  policeNavigation
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [actionError,setActionError]=useState('');
  useModalScrollLock(isOpen);
  const location = useDeviceLocation(isOpen, 'sos');

  if (!isOpen) return null;

  const canShare=location.status==='ready'&&isFreshSosLocation(location.position);
  const handleShareLocationWhatsApp=async(phone?:string)=>{setActionError('');try{if(!canShare)return;await openSosLink(whatsAppSosUrl(location.position!,phone));}catch(e){setActionError((e as Error).message);}};
  const handleCopyCoords=async()=>{setActionError('');try{if(!canShare)return;await copySosMessage(location.position!);setCopiedLink(true);setTimeout(()=>setCopiedLink(false),2500);}catch{setActionError('Não foi possível copiar. Tente abrir a mensagem no WhatsApp.');}};

  return (
    <div role="dialog" aria-modal="true" aria-label="SOS" className="fixed inset-0 z-60 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
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
          <button aria-label="Fechar SOS" onClick={onClose} className="p-1 rounded-full hover:bg-rose-700 text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200" role="status">
            {canShare ? `Localização obtida pelo GPS (precisão aproximada: ${Math.round(location.position!.accuracyMeters)} m).` : location.error || 'Buscando sua localização pelo GPS...'}
            {location.error && <button onClick={location.retry} className="block mt-2 text-rose-700 font-bold">Tentar novamente</button>}
          </div>
          {policeNavigation && <PoliceRouteAction key={policeNavigation.tripId} navigation={policeNavigation}
            position={canShare ? location.position : null} onClose={onClose}/>}
          {/* Direct Public Emergency Hotlines in Brazil */}
          <div className="space-y-2">
            <span className="font-bold text-slate-800 uppercase tracking-wider block text-[10px]">
              Serviços Públicos de Emergência (Brasil)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <a
                href="tel:190" onClick={e=>{e.preventDefault();void openSosLink('tel:190').catch(err=>setActionError(err.message));}}
                className="p-3 rounded-2xl bg-slate-50 border border-slate-200 hover:border-rose-300 text-slate-900 font-bold flex items-center justify-between transition-colors"
              >
                <div>
                  <span className="block text-rose-700">Polícia Militar</span>
                  <span className="text-base font-extrabold">190</span>
                </div>
                <Phone className="w-4 h-4 text-rose-600" />
              </a>

              <a
                href="tel:191" onClick={e=>{e.preventDefault();void openSosLink('tel:191').catch(err=>setActionError(err.message));}}
                className="p-3 rounded-2xl bg-slate-50 border border-slate-200 hover:border-rose-300 text-slate-900 font-bold flex items-center justify-between transition-colors"
              >
                <div>
                  <span className="block text-rose-700">Polícia Rodoviária</span>
                  <span className="text-base font-extrabold">191</span>
                </div>
                <Phone className="w-4 h-4 text-rose-600" />
              </a>

              <a
                href="tel:192" onClick={e=>{e.preventDefault();void openSosLink('tel:192').catch(err=>setActionError(err.message));}}
                className="p-3 rounded-2xl bg-slate-50 border border-slate-200 hover:border-rose-300 text-slate-900 font-bold flex items-center justify-between transition-colors"
              >
                <div>
                  <span className="block text-rose-700">SAMU (Resgate)</span>
                  <span className="text-base font-extrabold">192</span>
                </div>
                <Phone className="w-4 h-4 text-rose-600" />
              </a>

              <a
                href="tel:193" onClick={e=>{e.preventDefault();void openSosLink('tel:193').catch(err=>setActionError(err.message));}}
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
                        href={`tel:${c.phone}`}
                        onClick={e=>{e.preventDefault();try{void openSosLink('tel:'+normalizeContactPhone(c.phone)).catch(err=>setActionError(err.message));}catch(err){setActionError((err as Error).message);}}}
                        className="p-2 rounded-xl bg-slate-200 text-slate-800 hover:bg-slate-300 transition-colors"
                        title="Ligar" aria-label={`Ligar para ${c.name}`}
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => handleShareLocationWhatsApp(c.phone)}
                        disabled={!canShare}
                        className="p-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                        title="Enviar localização no WhatsApp" aria-label={`Enviar localização para ${c.name} no WhatsApp`}
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {actionError&&<p role="alert" className="text-rose-700">{actionError}</p>}
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

          <button onClick={()=>void handleShareLocationWhatsApp()} disabled={!canShare} className="w-full p-3 bg-emerald-700 text-white rounded-xl font-bold">Abrir SOS no WhatsApp</button>
          <p className="text-xs text-slate-600">O app abre o discador ou a mensagem. Você confirma a ligação ou o envio no aplicativo escolhido.</p>
          <p className="text-[10px] text-slate-400 text-center leading-relaxed">
            O SOS é um recurso auxiliar de conveniência e não substitui os canais oficiais de socorro das concessionárias ou autoridades públicas.
          </p>
        </div>
      </div>
    </div>
  );
};

