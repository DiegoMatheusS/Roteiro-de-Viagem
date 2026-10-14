import React, { useState, useEffect } from 'react';
import { ConvoySession, ConvoyParticipant, MeetingPoint, Vehicle, TripPlan } from '../types';
import { convoyService } from '../services/convoyService';
import { InteractiveMap } from './InteractiveMap';
import type { useConvoyGps } from '../hooks/useConvoyGps';
import { getCurrentDeviceLocation } from '../services/locationService';
import { 
  Users, 
  MapPin, 
  Share2, 
  Shield, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  Plus, 
  LogOut, 
  Copy, 
  Check, 
  Radio, 
  ArrowLeft,
  AlertCircle,
  Map as MapIcon,
  Search,
  Navigation,
  Crosshair,
  Building2,
  Sparkles,
  PowerOff
} from 'lucide-react';

interface ConvoyScreenProps {
  locationState:ReturnType<typeof useConvoyGps>;organizerTrip?:TripPlan;
  convoyId: string;
  currentUserId: string;
  currentUserName: string;
  currentVehicle: Vehicle | null;
  onBack: () => void;
  onEndConvoy?: () => void;
}

export const ConvoyScreen: React.FC<ConvoyScreenProps> = ({
  convoyId,
  locationState,organizerTrip,
  currentUserId,
  currentUserName,
  currentVehicle,
  onBack,
  onEndConvoy
}) => {
  const [convoy, setConvoy] = useState<ConvoySession | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showAddMeetingPoint, setShowAddMeetingPoint] = useState(false);
  const [newMeetingPointTitle, setNewMeetingPointTitle] = useState('');
  const [newMeetingPointCategory, setNewMeetingPointCategory] = useState<'minha_escolha' | 'posto' | 'restaurante' | 'mirante'>('minha_escolha');
  const [newCep, setNewCep] = useState('');
  const [newStreet, setNewStreet] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [newNeighborhood, setNewNeighborhood] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [focusedCoords, setFocusedCoords] = useState<[number, number] | null>(null);
  const [newMeetingPointCoords, setNewMeetingPointCoords] = useState<[number, number] | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showEndConvoyConfirm, setShowEndConvoyConfirm] = useState(false);
  const [showLeaveConvoyConfirm, setShowLeaveConvoyConfirm] = useState(false);
  const [refreshing,setRefreshing]=useState(false),[pendingPoint,setPendingPoint]=useState<MeetingPoint|null>(null),[actionBusy,setActionBusy]=useState(false);
  useEffect(()=>{
    let disposed=false,busy=false;
    const load=async()=>{if(busy)return;busy=true;setRefreshing(true);try{const session=await convoyService.getConvoy(convoyId);if(!disposed){setConvoy(session);setLocationError(null);}}catch(error){if(!disposed)setLocationError((error as Error).message);}finally{convoyService.expireLocations();busy=false;if(!disposed)setRefreshing(false);}};
    const changed=()=>{const cached=convoyService.getConvoys().find(c=>c.id===convoyId);if(!disposed&&cached)setConvoy(cached);};
    const resume=()=>{if(!document.hidden)void load();};
    window.addEventListener('rdv:convoys-changed',changed);window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
    void load();const timer=window.setInterval(()=>void load(),5000);
    return()=>{disposed=true;clearInterval(timer);window.removeEventListener('rdv:convoys-changed',changed);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);};
  },[convoyId]);

  if (!convoy) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>Comboio não encontrado ou já finalizado.</p>
        <button onClick={onBack} className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold">
          Voltar
        </button>
      </div>
    );
  }

  const currentUserParticipant = convoy.participants.find(p => p.id === currentUserId);
  const isOrganizer = currentUserParticipant?.isOrganizer ?? false;
  const isSharingLocation = currentUserParticipant?.isSharingLocation && locationState.session?.convoyId===convoyId && convoy.ownLocationToken===locationState.session.locationToken;

  // Toggle user's live location sharing (Requirement #3)
  const handleToggleLocation = async () => {
    try {
    if(actionBusy)return;setActionBusy(true);setLocationError(null);
    const updated = await convoyService.toggleParticipantLocation(convoy.id, currentUserId, !isSharingLocation);
    if (updated) setConvoy({ ...updated });
    } catch (error) { setLocationError((error as Error).message); }finally{setActionBusy(false);}
  };

  // Toggle check-in at a meeting point
  const handleToggleCheckIn = async (mpId: string) => {
    try {
    const updated = await convoyService.checkInMeetingPoint(convoy.id, mpId, currentUserId);
    if (updated) setConvoy({ ...updated });
    } catch (error) { setLocationError((error as Error).message); }
  };

  // Search CEP from ViaCEP API
  const handleCepLookup = async (cepInput: string) => {
    const clean = cepInput.replace(/\D/g, '');
    if (clean.length === 8) {
      setIsSearchingCep(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        const data = await res.json();
        if (!data.erro) {
          if (data.logradouro) setNewStreet(data.logradouro);
          if (data.bairro) setNewNeighborhood(data.bairro);
          if (data.localidade) setNewCity(`${data.localidade} - ${data.uf}`);
          if (!newMeetingPointTitle) {
            setNewMeetingPointTitle(data.logradouro || `Ponto ${data.bairro}`);
          }
        }
      } catch (err) {
        console.warn('CEP lookup error:', err);
      } finally {
        setIsSearchingCep(false);
      }
    }
  };

  // Add new meeting point with address details & Minha Escolha option
  const handleAddMeetingPoint = async () => {
    try {
    const finalTitle = newMeetingPointTitle.trim() || newStreet.trim() || 'Ponto Customizado';
    if (!finalTitle) return;

    if (!newMeetingPointCoords) { setLocationError('Selecione o ponto no mapa ou use sua posição GPS.'); return; }
    const defaultCoords = newMeetingPointCoords;

    const updated = await convoyService.addMeetingPoint(convoy.id, {
      title: finalTitle,
      category: newMeetingPointCategory,
      coords: defaultCoords,
      description: newDescription.trim() || undefined,
      cep: newCep.trim() || undefined,
      street: newStreet.trim() || undefined,
      number: newNumber.trim() || undefined,
      neighborhood: newNeighborhood.trim() || undefined,
      city: newCity.trim() || undefined,
      order: convoy.meetingPoints.length + 1
    });

    if (updated) {
      setConvoy({ ...updated });
      setFocusedCoords(defaultCoords);
      setNewMeetingPointTitle('');
      setNewCep('');
      setNewStreet('');
      setNewNumber('');
      setNewNeighborhood('');
      setNewCity('');
      setNewDescription('');
      setNewMeetingPointCoords(null);
      setShowAddMeetingPoint(false);
    }
    } catch (error) { setLocationError((error as Error).message); }
  };

  // Copy invitation link
  const handleCopyInvite = () => {
    const inviteText = `Venha participar do Comboio "${convoy.title}"!\nCódigo de acesso: ${convoy.code}\nRoteiro: ${convoy.originName} até ${convoy.destinationName}`;
    navigator.clipboard.writeText(inviteText);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  // Leave convoy
  const handleLeave = () => {
    setShowLeaveConvoyConfirm(true);
  };

  const executeLeave = async () => {
    try {
    await convoyService.leaveConvoy(convoy.id, currentUserId);
    setShowLeaveConvoyConfirm(false);
    onEndConvoy?.();
    onBack();
    } catch (error) { setLocationError((error as Error).message); }
  };

  // End convoy (Organizador ou qualquer participante confirmando encerramento)
  const handleEndConvoy = () => {
    setShowEndConvoyConfirm(true);
  };

  const executeEndConvoy = async () => {
    try {
    if (!await convoyService.endConvoy(convoy.id, currentUserId)) return;
    setShowEndConvoyConfirm(false);
    onEndConvoy?.();
    onBack();
    } catch (error) { setLocationError((error as Error).message); }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 overflow-hidden">
      <p className="px-4 py-2 text-xs bg-amber-50 text-amber-900">Comboio sincronizado entre celulares. Atualização automática a cada 5 segundos; o GPS continua ao voltar ao menu enquanto o compartilhamento estiver ativo.</p>
      {(locationError||locationState.error) && <p role="alert" className="px-4 py-2 text-xs text-rose-700">{locationError||locationState.error}</p>}
      {convoy.status !== 'active' && <p className="p-3 bg-slate-200 text-sm">Este comboio foi encerrado. A localização de todos foi ocultada.<button onClick={onBack} className="ml-3 underline">Voltar ao menu</button></p>}
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            aria-label="Voltar ao menu e manter comboio ativo"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-violet-600 animate-pulse" />
              <h2 className="text-sm font-bold text-slate-900 truncate max-w-[200px] sm:max-w-xs">
                {convoy.title}
              </h2>
            </div>
            <div className="text-[11px] text-slate-500">
              Código: <strong className="text-violet-700 font-mono tracking-wider">{convoy.code}</strong>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyInvite}
            className="px-3 py-1.5 rounded-xl border border-slate-200 hover:border-violet-400 bg-white text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5 text-violet-600" />}
            <span className="hidden sm:inline">{copiedCode ? 'Copiado!' : 'Convidar'}</span>
          </button>

          <button
            onClick={handleLeave}
            className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
            title="Sair do comboio"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sair</span>
          </button>

          {isOrganizer && <button
            onClick={handleEndConvoy}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
            title="Encerrar comboio para todos"
          >
            <span>Encerrar Comboio</span>
          </button>}
        </div>
      </div>

      {/* Main Split: Interactive Map & Convoy Dashboard */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* MAP VIEW */}
        <div className="flex-1 h-[45vh] lg:h-full relative min-h-[250px]">
          <InteractiveMap 
            routePath={convoy.routePath}
            convoyParticipants={convoy.participants}
            meetingPoints={convoy.meetingPoints}
            focusedCoords={focusedCoords}
            onSelectCoordinates={showAddMeetingPoint ? coords => { setNewMeetingPointCoords(coords); setFocusedCoords(coords); } : undefined}
            className="w-full h-full"
          />

          {/* Floating Location Sharing Control in Map */}
          <div className="absolute top-3 left-3 z-30">
            <button
              onClick={handleToggleLocation}
              disabled={actionBusy||convoy.status!=='active'}
              className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg backdrop-blur-md transition-all ${
                isSharingLocation 
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                  : 'bg-white/95 text-slate-800 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {isSharingLocation ? (
                <>
                  <Eye className="w-4 h-4 text-white animate-pulse" />
                  <span>{locationState.ready ? 'Localização ativa' : 'Buscando GPS...'}</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-4 h-4 text-slate-400" />
                  <span>Compartilhar Localização</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* SIDEBAR / DRAWER OF PARTICIPANTS & MEETING POINTS */}
        <div className="w-full lg:w-96 bg-white border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col overflow-y-auto max-h-[55vh] lg:max-h-full">
          <div className="p-3 border-b text-xs space-y-2"><p>{refreshing?'Conferindo atualizações...':`Atualizado ${new Date(convoy.updatedAt).toLocaleTimeString('pt-BR')}`} · participantes e roteiro</p><button onClick={()=>void convoyService.getConvoy(convoyId).then(setConvoy).catch(e=>setLocationError(e.message))} className="underline font-bold">Atualizar comboio agora</button>{isOrganizer&&organizerTrip&&convoy.status==='active'&&<button disabled={actionBusy} onClick={async()=>{setActionBusy(true);try{setConvoy(await convoyService.updateRoute(convoyId,organizerTrip,convoy.routeRevision||0));setLocationError(null);}catch(e){setLocationError((e as Error).message);}finally{setActionBusy(false);}}} className="block underline font-bold text-violet-700">Atualizar roteiro do comboio</button>}</div>
          {/* Location status callout */}
          <div className="p-4 bg-slate-50 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-violet-600" />
                Sua Localização no Grupo
              </span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                isSharingLocation ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
              }`}>
                {isSharingLocation ? 'Transmitindo' : currentUserParticipant?.isSharingLocation ? 'Outro aparelho' : 'Oculta'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              {isSharingLocation 
                ? 'Os membros autorizados do comboio conseguem ver sua posição aproximada no mapa.'
                : currentUserParticipant?.isSharingLocation ? 'Esta conta tem uma posição no grupo, mas este aparelho não está enviando GPS.' : 'Você está no comboio, mas sua localização não está visível.'}
            </p>
          </div>

          {/* MEETING POINTS (PONTOS DE ENCONTRO) */}
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-violet-600" />
                  Pontos de Encontro ({convoy.meetingPoints.length})
                </h4>
                <p className="text-[10px] text-slate-400">
                  Defina onde o grupo irá parar e se reagrupar
                </p>
              </div>
              {isOrganizer&&convoy.status==='active'&&<button
                type="button"
                onClick={() => setShowAddMeetingPoint(!showAddMeetingPoint)}
                className="text-xs font-bold text-violet-700 hover:text-violet-900 bg-violet-50 hover:bg-violet-100 px-2.5 py-1 rounded-lg border border-violet-200 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar Ponto
              </button>}
            </div>

            {/* Add meeting point inline form */}
            {showAddMeetingPoint && isOrganizer && convoy.status==='active' && (
              <div className="p-3.5 bg-violet-50/60 rounded-2xl border border-violet-200 space-y-3 animate-in fade-in shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-violet-900 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                    Novo Ponto de Encontro
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddMeetingPoint(false)}
                    className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>

                {/* Categoria do Ponto com "Minha Escolha" */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    Tipo do Ponto
                  </label>
                  <select
                    value={newMeetingPointCategory}
                    onChange={(e) => setNewMeetingPointCategory(e.target.value as any)}
                    className="w-full text-xs font-semibold px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 shadow-2xs focus:ring-2 focus:ring-violet-500/20"
                  >
                    <option value="minha_escolha">⭐ Minha Escolha (Personalizado)</option>
                    <option value="posto">⛽ Posto de Combustível</option>
                    <option value="restaurante">☕ Restaurante / Café / Almoço</option>
                    <option value="mirante">🌄 Mirante & Parada Cênica</option>
                  </select>
                </div>

                {/* Nome do Local */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    Nome do Local
                  </label>
                  <input 
                    type="text"
                    placeholder="Ex: Ponto de Encontro da Galera / Posto Graal"
                    value={newMeetingPointTitle}
                    onChange={(e) => setNewMeetingPointTitle(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white placeholder-slate-400 focus:ring-2 focus:ring-violet-500/20"
                  />
                </div>

                {/* CEP com Busca Automática */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    CEP (Preenchimento Rápido)
                  </label>
                  <div className="flex gap-1.5">
                    <input 
                      type="text"
                      placeholder="00000-000"
                      maxLength={9}
                      value={newCep}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewCep(val);
                        if (val.replace(/\D/g, '').length === 8) {
                          handleCepLookup(val);
                        }
                      }}
                      className="flex-1 text-xs px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white font-mono placeholder-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => handleCepLookup(newCep)}
                      disabled={isSearchingCep}
                      className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs shrink-0"
                    >
                      <Search className="w-3 h-3" />
                      <span>{isSearchingCep ? 'Buscando...' : 'Buscar'}</span>
                    </button>
                  </div>
                </div>

                {/* Nome da Rua / Logradouro */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    Nome da Rua / Rodovia / Logradouro
                  </label>
                  <input 
                    type="text"
                    placeholder="Ex: Rodovia Ayrton Senna, km 125 ou Av. das Hortênsias"
                    value={newStreet}
                    onChange={(e) => setNewStreet(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white placeholder-slate-400"
                  />
                </div>

                {/* Número e Bairro */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                      Número / Km
                    </label>
                    <input 
                      type="text"
                      placeholder="Ex: 1250 ou Km 42"
                      value={newNumber}
                      onChange={(e) => setNewNumber(e.target.value)}
                      className="w-full text-xs px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white placeholder-slate-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                      Bairro
                    </label>
                    <input 
                      type="text"
                      placeholder="Ex: Centro / Serra"
                      value={newNeighborhood}
                      onChange={(e) => setNewNeighborhood(e.target.value)}
                      className="w-full text-xs px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white placeholder-slate-400"
                    />
                  </div>
                </div>

                {/* Cidade / UF */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    Cidade / UF
                  </label>
                  <input 
                    type="text"
                    placeholder="Ex: São José dos Campos - SP"
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white placeholder-slate-400"
                  />
                </div>

                {/* Instruções adicionais */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    Instruções ou Descrição (Opcional)
                  </label>
                  <input 
                    type="text"
                    placeholder="Ex: Parar na bomba 4 para calibragem e café"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white placeholder-slate-400"
                  />
                </div>

                {/* Botão de Localização GPS */}
                <button
                  type="button"
                  onClick={async () => {
                    try {
                        const { coords } = await getCurrentDeviceLocation();
                        setNewMeetingPointCoords(coords);
                        setFocusedCoords(coords);
                        if (!newMeetingPointTitle) setNewMeetingPointTitle('Minha Localização GPS Atual');
                    } catch (error) { setLocationError((error as Error).message); }
                  }}
                  className="text-[11px] font-semibold text-violet-700 hover:text-violet-900 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Crosshair className="w-3.5 h-3.5 text-violet-600" />
                  <span>Usar Coordenadas da Minha Posição GPS Atual</span>
                </button>
                <p className="text-[11px] text-slate-600">{newMeetingPointCoords ? `Ponto escolhido: ${newMeetingPointCoords.map(c => c.toFixed(5)).join(', ')}` : 'Toque no mapa para escolher a localização do ponto.'}</p>

                {/* Ações Salvar / Cancelar */}
                <div className="flex items-center gap-2 pt-1 border-t border-violet-100">
                  <button
                    type="button"
                    onClick={() => setShowAddMeetingPoint(false)}
                    className="flex-1 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleAddMeetingPoint}
                    disabled={!newMeetingPointCoords}
                    className="flex-1 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-md shadow-violet-600/20 cursor-pointer"
                  >
                    Salvar Ponto
                  </button>
                </div>
              </div>
            )}

            {/* Meeting points list */}
            <div className="space-y-2.5">
              {convoy.meetingPoints.map((mp, idx) => {
                const userCheckedIn = mp.confirmedArrivedParticipantIds.includes(currentUserId);
                const isMinhaEscolha = mp.category === 'minha_escolha';
                const hasAddress = mp.street || mp.neighborhood || mp.city || mp.cep;

                return (
                  <div 
                    key={mp.id}
                    className="p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-violet-300 transition-all space-y-2 shadow-2xs group"
                  >
                    {isOrganizer&&convoy.status==='active'&&<button aria-label={`Remover ponto ${mp.title}`} onClick={()=>setPendingPoint(mp)} className="text-xs text-rose-700 underline">Remover ponto</button>}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ${
                            isMinhaEscolha 
                              ? 'bg-blue-100 text-blue-800' 
                              : mp.category === 'posto'
                              ? 'bg-amber-100 text-amber-800'
                              : mp.category === 'restaurante'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {isMinhaEscolha ? '⭐ Minha Escolha' : mp.category === 'posto' ? '⛽ Posto' : mp.category === 'restaurante' ? '☕ Restaurante' : '🌄 Mirante'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold">Ponto #{idx + 1}</span>
                        </div>
                        <div className="text-xs sm:text-sm font-extrabold text-slate-900 leading-snug">
                          {mp.title}
                        </div>

                        {/* Endereço detalhado se disponível (CEP, Rua, Bairro, Cidade) */}
                        {hasAddress && (
                          <div className="text-[11px] text-slate-600 mt-1 flex items-start gap-1 font-medium bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                            <Building2 className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                            <span className="leading-tight">
                              {[
                                mp.street ? `${mp.street}${mp.number ? ', ' + mp.number : ''}` : '',
                                mp.neighborhood || '',
                                mp.city || '',
                                mp.cep ? `CEP ${mp.cep}` : ''
                              ].filter(Boolean).join(' · ')}
                            </span>
                          </div>
                        )}

                        {mp.description && (
                          <div className="text-[11px] text-slate-500 mt-1 italic">
                            "{mp.description}"
                          </div>
                        )}
                      </div>

                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 shrink-0">
                        {mp.confirmedArrivedParticipantIds.length} no local
                      </span>
                    </div>

                    {/* Action buttons: Ver no Mapa + Cheguei */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
                      {/* BOTÃO DE MAPA PARA LEVAR ATÉ O PONTO ESCOLHIDO */}
                      <button
                        type="button"
                        onClick={() => {
                          setFocusedCoords(mp.coords);
                        }}
                        className="py-1 px-2.5 rounded-xl text-[11px] font-bold bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs hover:scale-102 active:scale-98"
                        title="Levar e centralizar no mapa neste ponto de encontro"
                      >
                        <MapIcon className="w-3.5 h-3.5 text-violet-600" />
                        <span>Ver no Mapa</span>
                      </button>

                      {/* Check-in button */}
                      <button
                        type="button"
                        onClick={() => handleToggleCheckIn(mp.id)}
                        className={`py-1 px-2.5 rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer ${
                          userCheckedIn 
                            ? 'bg-emerald-600 text-white shadow-xs' 
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        <CheckCircle2 className={`w-3.5 h-3.5 ${userCheckedIn ? 'text-white' : 'text-slate-400'}`} />
                        <span>{userCheckedIn ? 'Estou Aqui ✓' : 'Cheguei'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PARTICIPANTS LIST (PARTICIPANTES) */}
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-violet-600" />
                Participantes ({convoy.participants.length})
              </h4>
              <span className="text-[11px] text-slate-500">
                {convoy.participants.filter(p => p.isSharingLocation).length} visíveis no mapa
              </span>
            </div>

            <div className="space-y-2">
              {convoy.participants.map(p => {
                const isMoto = p.vehicleType === 'motorcycle';
                const isUser = p.id === currentUserId;

                return (
                  <div 
                    key={p.id}
                    className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-700 shrink-0">
                        {isMoto ? '🏍️' : '🚗'}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{p.name}</span>
                          {isUser && <span className="text-[10px] text-slate-400 font-normal">(Você)</span>}
                          {p.isOrganizer && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-rose-100 text-rose-700">
                              Líder
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {p.vehicleNickname || (isMoto ? 'Moto' : 'Carro')}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      {p.isSharingLocation ? (
                        <div>
                          <span className={`text-[10px] font-semibold flex items-center gap-1 justify-end ${
                            p.isStale ? 'text-amber-600' : 'text-emerald-600'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${p.isStale ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                            {p.isStale ? 'Sinal antigo' : 'Ao vivo'}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {p.lastLocationTimestamp || 'recente'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-medium">
                          Localização oculta
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Privacy footer & End Convoy CTA */}
          <div className="mt-auto p-4 bg-slate-50 border-t border-slate-200 space-y-3">
            <div className="text-[11px] text-slate-500 flex items-start gap-2 leading-relaxed">
              <Shield className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Respeito estrito à privacidade: quem não autorizar localização não aparece no mapa.
              </span>
            </div>

            {isOrganizer&&convoy.status==='active'&&<button
              type="button"
              onClick={handleEndConvoy}
              className="w-full py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <span>Encerrar este Comboio de Viagem</span>
            </button>}
          </div>
        </div>
      </div>

      {pendingPoint&&<div role="dialog" aria-modal="true" aria-label="Remover ponto de encontro" className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4"><div className="bg-white p-5 rounded-2xl space-y-3"><p>Remover “{pendingPoint.title}” para todos os participantes?</p><button onClick={()=>setPendingPoint(null)} className="p-2 border rounded-lg">Manter ponto</button><button disabled={actionBusy} onClick={async()=>{setActionBusy(true);try{setConvoy(await convoyService.removeMeetingPoint(convoyId,pendingPoint.id,convoy.routeRevision||0));setPendingPoint(null);}catch(e){setLocationError((e as Error).message);}finally{setActionBusy(false);}}} className="p-2 bg-rose-700 text-white rounded-lg">Confirmar remoção</button></div></div>}
      {/* MODAL DE CONFIRMAÇÃO PARA ENCERRAR COMBOIO */}
      {showEndConvoyConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 border border-slate-200 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-xs">
              <AlertCircle className="w-6 h-6 stroke-[2.5]" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-sm font-extrabold text-slate-900">
                Encerrar este Comboio de Viagem?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Esta ação finalizará o comboio para todos os participantes e desativará o compartilhamento de localização imediatamente.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowEndConvoyConfirm(false)}
                className="py-2.5 px-3 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeEndConvoy}
                className="py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold transition-colors shadow-md shadow-rose-600/20 cursor-pointer"
              >
                Sim, Encerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO PARA SAIR DO COMBOIO */}
      {showLeaveConvoyConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 border border-slate-200 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center mx-auto shadow-xs">
              <LogOut className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-sm font-extrabold text-slate-900">
                Deseja Sair deste Comboio?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Sua localização deixará de ser compartilhada no mapa deste comboio imediatamente.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowLeaveConvoyConfirm(false)}
                className="py-2.5 px-3 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeLeave}
                className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-extrabold transition-colors shadow-md cursor-pointer"
              >
                Sim, Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

