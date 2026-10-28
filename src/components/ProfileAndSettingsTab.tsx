import { AndroidStatus } from './AndroidStatus';
import {GpsCalibrationPanel} from './GpsCalibrationPanel';
import {OfflineRegionsPanel} from './OfflineRegionsPanel';
import { EmergencyContactsEditor } from './EmergencyContactsEditor';
import { ProfileFigmaHome } from './ProfileFigmaHome';
import React, { useState } from 'react';
import {useMapAppearance} from '../hooks/useMapAppearance';
import type {MapAppearanceMode} from '../services/mapAppearance';
import { 
  TravelerProfile, 
  Vehicle, 
  FuelLog, 
  Achievement, 
  VehicleType, 
  FuelType,
  TripPlan
} from '../types';
import { storageService } from '../services/storageService';
import { lookupVehicleBenchmark, KNOWN_VEHICLE_DATABASE } from '../data/vehicleSpecs';
import { 
  User, 
  Award, 
  Car, 
  Plus, 
  Shield, 
  Phone, 
  Home, 
  AlertOctagon, 
  ChevronRight, 
  Gauge, 
  CheckCircle2, 
  Fuel, 
  Trash2, 
  Edit3, 
  Eye, 
  Lock,
  Sparkles,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react';

interface ProfileAndSettingsTabProps {
  profile: TravelerProfile;
  vehicles: Vehicle[];
  fuelLogs: FuelLog[];
  achievements: Achievement[];
  trips: TripPlan[];
  selectedVehicleId: string;
  onUpdateProfile: (p: TravelerProfile) => void;
  onSelectVehicle: (id: string) => void;
  onAddOrUpdateVehicle: (v: Vehicle) => void;
  onDeleteVehicle: (id: string) => void;
  onAddFuelLog: (log: FuelLog) => void;
  onOpenSosModal: () => void;
  onNavigateHome: () => void;
  accountLabel?: string;
  onLogin: () => void;
  onLogout: () => void;
  onOpenConvoy: () => void;
}

export const ProfileAndSettingsTab: React.FC<ProfileAndSettingsTabProps> = ({
  profile,
  vehicles,
  fuelLogs,
  achievements,
  trips,
  selectedVehicleId,
  onUpdateProfile,
  onSelectVehicle,
  onAddOrUpdateVehicle,
  onDeleteVehicle,
  onAddFuelLog,
  onOpenSosModal,
  onNavigateHome,
  accountLabel, onLogin, onLogout, onOpenConvoy
}) => {
  const [editingProfile,setEditingProfile]=useState(false),[profileName,setProfileName]=useState(''),[profileBio,setProfileBio]=useState('');
  const [activeSubTab, setActiveSubTab] = useState<'perfil' | 'garagem' | 'seguranca' | 'privacidade'>('perfil');
  const [showDetails,setShowDetails]=useState(false);
  const {mode:appearanceMode,setMode:setAppearanceMode}=useMapAppearance();
  const openDetails=(tab:'perfil'|'garagem'|'seguranca'|'privacidade')=>{
    setActiveSubTab(tab);setShowDetails(true);
  };

  // Stats filter (Requirement #1: por mês, ano, veículo)
  const [statsPeriod, setStatsPeriod] = useState<'total' | 'ano' | 'mes'>('total');
  const [statsVehicleId, setStatsVehicleId] = useState<string>('all');

  // Add vehicle modal state
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [vehType, setVehType] = useState<VehicleType>('motorcycle');
  const [vehBrand, setVehBrand] = useState('Honda');
  const [vehModel, setVehModel] = useState('CB 500X / NX 500');
  const [vehYear, setVehYear] = useState<number>(2024);
  const [vehNickname, setVehNickname] = useState('');
  const [vehVersion, setVehVersion] = useState('');
  const [vehFuelType, setVehFuelType] = useState<FuelType>('gasolina');
  const [vehTankLiters, setVehTankLiters] = useState<number>(17.7);
  const [vehUserConsumption, setVehUserConsumption] = useState<number>(28.2);
  const [vehBenchmarkNote, setVehBenchmarkNote] = useState<string>('');

  // Fuel refill modal state
  const [showRefillModal, setShowRefillModal] = useState(false);
  const [refillVehicleId, setRefillVehicleId] = useState<string>(selectedVehicleId);
  const [refillOdometer, setRefillOdometer] = useState<number>(4500);
  const [refillLiters, setRefillLiters] = useState<number>(15.0);
  const [refillPrice, setRefillPrice] = useState<number>(5.89);
  const [refillFullTank, setRefillFullTank] = useState<boolean>(true);
  const [refillNotes, setRefillNotes] = useState<string>('');

  // Calculate Traveler Level
  const totalKm = profile.verifiedGpsKm + profile.manualKm;
  const tierInfo = storageService.calculateTier(totalKm);

  // Filtered stats calculation
  const completedTrips = trips.filter(t => t.status === 'completed');
  const vehicleStatsMap: Record<string, { km: number; tripsCount: number; litersEstimated: number }> = {};
  
  vehicles.forEach(v => {
    const vTrips = completedTrips.filter(t => t.vehicleId === v.id);
    const vKm = vTrips.reduce((acc, t) => acc + (t.actualDistanceKm || t.distanceKm), 0);
    const kmL = v.consumption.userConfigured || 15;
    vehicleStatsMap[v.id] = {
      km: vKm,
      tripsCount: vTrips.length,
      litersEstimated: parseFloat((vKm / kmL).toFixed(1))
    };
  });

  // Benchmark auto-lookup handler when creating vehicle
  const handleLookupSpecs = () => {
    const result = lookupVehicleBenchmark(vehType, vehBrand, vehModel, vehYear);
    if (result) {
      setVehTankLiters(result.version.tankCapacityLiters);
      setVehUserConsumption(result.version.consumption.averageKmL);
      setVehFuelType(result.version.fuelType);
      setVehVersion(result.version.name);
      setVehBenchmarkNote(`Fonte verificada: ${result.version.consumption.source} (${result.version.consumption.sourceDate}) · Urbano: ${result.version.consumption.urbanKmL} km/l, Rodoviário: ${result.version.consumption.highwayKmL} km/l`);
    } else {
      setVehBenchmarkNote('Nenhuma especificação oficial encontrada nesta base. Por favor informe os valores manualmente com base no manual do proprietário.');
    }
  };

  const handleSaveVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    const newVeh: Vehicle = {
      id: `veh-${Date.now()}`,
      type: vehType,
      brand: vehBrand.trim(),
      model: vehModel.trim(),
      year: vehYear,
      version: vehVersion.trim(),
      nickname: vehNickname.trim() || `${vehBrand} ${vehModel}`,
      fuelType: vehFuelType,
      tankCapacityLiters: vehTankLiters,
      odometerKm: 0,
      maxPassengers: vehType === 'motorcycle' ? 2 : 5,
      consumption: {
        referenceUrban: vehUserConsumption * 0.9,
        referenceHighway: vehUserConsumption * 1.1,
        referenceAverage: vehUserConsumption,
        source: vehBenchmarkNote.includes('Fonte') ? vehBenchmarkNote : 'Informado manualmente pelo proprietário',
        sourceDate: '2026',
        userConfigured: vehUserConsumption
      }
    };
    onAddOrUpdateVehicle(newVeh);
    setShowAddVehicleModal(false);
  };

  const handleSaveRefill = (e: React.FormEvent) => {
    e.preventDefault();
    const log: FuelLog = {
      id: `fl-${Date.now()}`,
      vehicleId: refillVehicleId,
      date: new Date().toISOString().split('T')[0],
      odometerKm: refillOdometer,
      liters: refillLiters,
      pricePerLiter: refillPrice,
      totalAmount: parseFloat((refillLiters * refillPrice).toFixed(2)),
      fullTank: refillFullTank,
      notes: refillNotes
    };
    onAddFuelLog(log);
    setShowRefillModal(false);
  };

  return (
    <div className="rdv-profile-shell">
      {!showDetails && <ProfileFigmaHome
        profile={profile} vehicles={vehicles} trips={trips} selectedVehicleId={selectedVehicleId}
        accountLabel={accountLabel} onLogin={onLogin}
        onEdit={()=>{setProfileName(profile.name);setProfileBio(profile.bio||'');setEditingProfile(true);openDetails('perfil');}}
        onAddVehicle={()=>setShowAddVehicleModal(true)}
        onOpenGarage={()=>openDetails('garagem')}
        onSelectVehicle={onSelectVehicle}
        onOpenSafety={()=>openDetails('seguranca')}
        onOpenSettings={()=>openDetails('privacidade')}
      />}
      {showDetails && <div className="rdv-profile-details">
        <div className="rdv-profile-details-return">
          <button type="button" onClick={()=>{setShowDetails(false);setEditingProfile(false);}}>
            <span aria-hidden="true">←</span> Voltar ao perfil
          </button>
        </div>
      {/* Top Bar Navigation Tabs */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="pl-20 pr-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-base font-extrabold text-slate-900 tracking-tight">
              Perfil
            </h1>
            <p className="text-[11px] text-slate-500">
              Nível do viajante, garagem inteligente e segurança.
            </p>
          </div>
        </div>

        {/* Sub-tab Navigation */}
        <div className="flex items-center px-6 gap-6 text-xs font-semibold border-t border-slate-100 overflow-x-auto no-scrollbar">
          {[
            { id: 'perfil', label: 'Meu Perfil & Nível' },
            { id: 'garagem', label: 'Minha Garagem' },
            { id: 'seguranca', label: 'Segurança & SOS' },
            { id: 'privacidade', label: 'Privacidade' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`py-3 whitespace-nowrap border-b-2 transition-all ${
                activeSubTab === tab.id
                  ? 'border-emerald-600 text-emerald-800 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        <section className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="min-w-0"><strong className="block text-sm">Minha conta</strong>
            <p className="text-xs text-slate-500 truncate">{accountLabel ? `Conectado: ${accountLabel}` : 'Entre para sincronizar suas viagens.'}</p></div>
          {accountLabel ? <button onClick={onLogout} className="text-xs font-bold text-rose-700 border rounded-xl px-3 py-2 shrink-0">Sair</button> :
            <button onClick={onLogin} className="text-xs font-bold text-white bg-blue-600 rounded-xl px-3 py-2 shrink-0">Entrar / Criar conta</button>}
        </section>
        {!vehicles.length && <p className="text-xs bg-blue-50 border border-blue-200 p-3 rounded-xl">Para calcular consumo e criar roteiros, cadastre seu carro ou moto na aba <button aria-label="Cadastrar meu veículo" className="underline font-bold" onClick={() => setActiveSubTab('garagem')}>Minha Garagem</button>. Nenhum veículo será adicionado automaticamente.</p>}
        <button type="button" onClick={onOpenConvoy} className="w-full text-left border bg-white border-slate-200 p-3 rounded-xl text-sm font-semibold">Entrar em um comboio por código</button>
        {/* ================================================= */}
        {/* SUBTAB 1: MEU PERFIL & SISTEMA DE NÍVEIS (SEÇÃO 1 & 2) */}
        {/* ================================================= */}
        {activeSubTab === 'perfil' && (
          <div className="space-y-6 animate-in fade-in">
            {/* PROFILE HERO CARD */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-black text-2xl flex items-center justify-center shadow-md">
                  {profile.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>{profile.name}</span>
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                      tierInfo.tier === 'Bronze' ? 'bg-amber-100 text-amber-900' :
                      tierInfo.tier === 'Prata' ? 'bg-slate-200 text-slate-800' :
                      tierInfo.tier === 'Ouro' ? 'bg-yellow-100 text-yellow-900 border border-yellow-300' :
                      'bg-cyan-100 text-cyan-900 border border-cyan-400'
                    }`}>
                      Nível {tierInfo.tier}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">{profile.bio}</p>
                </div>
              </div>

              <button onClick={()=>{setProfileName(profile.name);setProfileBio(profile.bio||'');setEditingProfile(v=>!v);}} className="text-xs font-bold underline text-emerald-700">Editar perfil</button>
              {editingProfile&&<form onSubmit={e=>{e.preventDefault();if(profileName.trim().length<2)return;onUpdateProfile({...profile,name:profileName.trim(),bio:profileBio.trim()});setEditingProfile(false);}} className="p-3 border rounded-xl space-y-3"><label className="block text-xs">Nome do perfil<input aria-label="Nome do perfil" required minLength={2} maxLength={50} value={profileName} onChange={e=>setProfileName(e.target.value)} className="block w-full p-2 border rounded-lg" /></label><label className="block text-xs">Sobre você<textarea aria-label="Sobre você" maxLength={1000} value={profileBio} onChange={e=>setProfileBio(e.target.value)} className="block w-full p-2 border rounded-lg" /></label><button className="p-2 bg-emerald-700 text-white rounded-lg text-xs">Salvar perfil</button></form>}
              {/* TIER PROGRESS BAR (Requirement #2) */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">
                    Nível Atual: <strong className="text-emerald-700">{tierInfo.tier}</strong>
                  </span>
                  {tierInfo.nextTier ? (
                    <span className="text-slate-500">
                      Faltam <strong className="text-slate-900 font-bold">{tierInfo.neededKmForNextTier} km</strong> para {tierInfo.nextTier}
                    </span>
                  ) : (
                    <span className="text-cyan-700 font-bold">Nível Máximo Atingido!</span>
                  )}
                </div>

                {/* Progress bar */}
                <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                    style={{ width: `${tierInfo.progressPercent}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                  <span>{tierInfo.thresholdMin} km</span>
                  <span>{totalKm} km acumulados</span>
                  <span>{tierInfo.thresholdMax} km</span>
                </div>
              </div>

              {/* KM BREAKDOWN: GPS VERIFIED VS MANUAL REPORTED (Requirement #1 & #2) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl border border-emerald-100 bg-emerald-50/50">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                    ✓ GPS Verificado
                  </span>
                  <div className="text-lg font-extrabold text-emerald-950 mt-1">
                    {profile.verifiedGpsKm} km
                  </div>
                  <span className="text-[10px] text-emerald-700 leading-tight block mt-0.5">
                    Registrados pelo trajeto real durante a viagem
                  </span>
                </div>

                <div className="p-3 rounded-2xl border border-slate-200 bg-slate-50">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Informado Manualmente
                  </span>
                  <div className="text-lg font-extrabold text-slate-900 mt-1">
                    {profile.manualKm} km
                  </div>
                  <span className="text-[10px] text-slate-500 leading-tight block mt-0.5">
                    Declarado sem sinal contínuo de satélite
                  </span>
                </div>
              </div>

              {/* GENERAL STATISTICS CARDS (Requirement #1) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-center">
                <div className="p-2.5 rounded-xl bg-slate-50">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">VIAGENS</span>
                  <strong className="text-sm font-extrabold text-slate-900">{profile.completedTripsCount}</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">ROTAS SALVAS</span>
                  <strong className="text-sm font-extrabold text-slate-900">{profile.savedRoutesCount}</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">PUBLICADOS</span>
                  <strong className="text-sm font-extrabold text-slate-900">{profile.publishedRoutesCount}</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">AVALIAÇÕES</span>
                  <strong className="text-sm font-extrabold text-slate-900">{profile.reviewsCount}</strong>
                </div>
              </div>
            </div>

            {/* ACHIEVEMENTS / CONQUISTAS (Requirement #2) */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-500" />
                  <span>Medalhas & Conquistas</span>
                </h3>
                <span className="text-xs text-slate-500 font-semibold">
                  {achievements.filter(a => a.unlockedAt).length} de {achievements.length} desbloqueadas
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {achievements.map(ach => {
                  const isUnlocked = !!ach.unlockedAt;
                  return (
                    <div
                      key={ach.id}
                      className={`p-3.5 rounded-2xl border transition-all flex items-start gap-3 ${
                        isUnlocked
                          ? 'border-amber-200 bg-amber-50/40 text-amber-950'
                          : 'border-slate-200 bg-slate-50/50 opacity-60 text-slate-600'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isUnlocked ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-400'
                      }`}>
                        <Award className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-slate-900">{ach.title}</h4>
                          {isUnlocked && <span className="text-[10px] text-amber-700 font-bold">✓ Conquistada</span>}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                          {ach.description}
                        </p>
                        <div className="text-[10px] text-slate-400 mt-1">
                          Progresso: {ach.progress} / {ach.target} {ach.unit}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ================================================= */}
        {/* SUBTAB 2: MINHA GARAGEM (SEÇÕES 3, 4, 5, 6) */}
        {/* ================================================= */}
        {activeSubTab === 'garagem' && (
          <div className="space-y-6 animate-in fade-in">
            {/* Header & Add button */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Meus Veículos ({vehicles.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Selecione o veículo padrão ou cadastre motos e carros.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowRefillModal(true)}
                  className="py-2 px-3 rounded-xl border border-slate-200 hover:border-emerald-500 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Fuel className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Abastecimento</span>
                </button>

                <button
                  onClick={() => setShowAddVehicleModal(true)}
                  className="py-2 px-3 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Novo Veículo</span>
                </button>
              </div>
            </div>

            {/* VEHICLES LIST */}
            <div className="space-y-4">
              {vehicles.map(v => {
                const isSelected = v.id === selectedVehicleId;
                const stats = vehicleStatsMap[v.id] || { km: 0, tripsCount: 0, litersEstimated: 0 };
                const isMoto = v.type === 'motorcycle';

                return (
                  <div
                    key={v.id}
                    className={`bg-white rounded-3xl p-5 border transition-all shadow-sm space-y-4 ${
                      isSelected
                        ? 'border-emerald-600 ring-2 ring-emerald-600/10'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Top Row */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-xl shrink-0">
                          {isMoto ? '🏍️' : '🚗'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-900">{v.nickname}</h4>
                            {isSelected && (
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                EM USO
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">
                            {v.brand} {v.model} {v.version ? `· ${v.version}` : ''} ({v.year})
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {!isSelected && (
                          <button
                            onClick={() => onSelectVehicle(v.id)}
                            className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
                          >
                            Selecionar
                          </button>
                        )}
                        <button
                          onClick={() => onDeleteVehicle(v.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* CONSUMPTION COMPARISON: BENCHMARK VS OBSERVED VS CONFIGURED (Requirement #4 & #5) */}
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-bold uppercase">
                          REFERÊNCIA OFICIAL
                        </span>
                        <strong className="text-slate-800 font-bold block text-sm">
                          {v.consumption.referenceAverage.toFixed(1)} km/l
                        </strong>
                        <span className="text-[10px] text-slate-500 block truncate" title={v.consumption.source}>
                          {v.consumption.source}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 block font-bold uppercase">
                          CONSUMO REAL OBSERVADO
                        </span>
                        <strong className="text-emerald-700 font-bold block text-sm">
                          {v.consumption.observedAverage ? `${v.consumption.observedAverage.toFixed(1)} km/l` : 'Aguardando 2 abastecimentos'}
                        </strong>
                        <span className="text-[10px] text-slate-500 block">
                          Média real em tanque cheio
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 block font-bold uppercase">
                          USADO NAS ROTAS
                        </span>
                        <strong className="text-slate-900 font-bold block text-sm">
                          {v.consumption.userConfigured.toFixed(1)} km/l
                        </strong>
                        <span className="text-[10px] text-slate-500 block">
                          Tanque: {v.tankCapacityLiters} L (~{Math.round(v.tankCapacityLiters * v.consumption.userConfigured)} km autonomia)
                        </span>
                      </div>
                    </div>

                    {/* STATS BY VEHICLE (Requirement #6) */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase">KM TOTAL</span>
                        <strong className="text-slate-900">{stats.km} km</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase">VIAGENS</span>
                        <strong className="text-slate-900">{stats.tripsCount}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase">LITROS ESTIMADOS</span>
                        <strong className="text-slate-900">{stats.litersEstimated} L</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* RECENT REFILLS LOGS */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200 space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Fuel className="w-4 h-4 text-emerald-600" />
                Histórico de Abastecimentos ({fuelLogs.length})
              </h4>
              <div className="space-y-2">
                {fuelLogs.map(log => (
                  <div key={log.id} className="p-3 rounded-xl bg-slate-50 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-800">{log.date}</span>
                      <span className="text-slate-500 block text-[11px]">
                        Odômetro: {log.odometerKm} km · {log.liters} L a R$ {log.pricePerLiter.toFixed(2)}/L
                      </span>
                    </div>
                    <div className="text-right">
                      <strong className="text-slate-900 block">R$ {log.totalAmount.toFixed(2)}</strong>
                      <span className="text-[10px] text-emerald-700 font-semibold">
                        {log.fullTank ? 'Tanque Cheio' : 'Parcial'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================================================= */}
        {/* SUBTAB 3: SEGURANÇA & SOS (SEÇÕES 8, 11, 29, 30) */}
        {/* ================================================= */}
        {activeSubTab === 'seguranca' && (
          <div className="space-y-6 animate-in fade-in">
            {/* SOS DIRECT CALLS */}
            <div className="bg-rose-50 rounded-3xl p-5 border border-rose-200 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center">
                  <AlertOctagon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-rose-950">Central SOS de Emergência</h3>
                  <p className="text-xs text-rose-700">Acesso imediato para motoristas e motociclistas.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <a href="tel:190" className="p-2.5 rounded-xl bg-white border border-rose-200 text-rose-900 font-bold text-center hover:bg-rose-100/50">
                  Polícia Militar · 190
                </a>
                <a href="tel:191" className="p-2.5 rounded-xl bg-white border border-rose-200 text-rose-900 font-bold text-center hover:bg-rose-100/50">
                  Polícia Rodoviária · 191
                </a>
                <a href="tel:192" className="p-2.5 rounded-xl bg-white border border-rose-200 text-rose-900 font-bold text-center hover:bg-rose-100/50">
                  SAMU · 192
                </a>
                <a href="tel:193" className="p-2.5 rounded-xl bg-white border border-rose-200 text-rose-900 font-bold text-center hover:bg-rose-100/50">
                  Bombeiros · 193
                </a>
              </div>

              <button
                onClick={onOpenSosModal}
                className="w-full py-2.5 rounded-xl bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 transition-colors"
              >
                Abrir Central SOS Completa
              </button>
            </div>

            <AndroidStatus />
            <GpsCalibrationPanel />
            {/* QUERO VOLTAR PRA CASA (Requirement #11) */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Home className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-slate-900">Quero Voltar pra Casa</h3>
                </div>
                <button
                  onClick={onNavigateHome}
                  className="py-1.5 px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
                >
                  Traçar Retorno Rápido
                </button>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Endereço Residencial Salvo
                </label>
                <input
                  type="text"
                  value={profile.homeAddress || ''}
                  onChange={(e) => onUpdateProfile({ ...profile, homeAddress: e.target.value })}
                  placeholder="Informe seu endereço para retorno de emergência"
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white"
                />
              </div>
            </div>

            {/* CONTATOS FAMILIARES DE EMERGÊNCIA (Requirement #30) */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Phone className="w-4 h-4 text-emerald-600" />
                Contatos Familiares Cadastrados ({profile.emergencyContacts.length})
              </h3>
              <EmergencyContactsEditor contacts={profile.emergencyContacts} onChange={contacts=>onUpdateProfile({...profile,emergencyContacts:contacts})} />
            </div>
          </div>
        )}

        {/* ================================================= */}
        {/* SUBTAB 4: PRIVACIDADE (SEÇÃO 8 & LGPD) */}
        {/* ================================================= */}
        {activeSubTab === 'privacidade' && (
          <div className="bg-white rounded-3xl p-6 border border-slate-200 space-y-5 animate-in fade-in">
            <section className="rounded-2xl border border-blue-100 bg-slate-50 p-4 space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">Aparência do mapa</h3>
              <label htmlFor="role-map-theme" className="block text-xs font-medium text-slate-700">
                Tema do Rolê
              </label>
              <select id="role-map-theme" value={appearanceMode}
                onChange={event=>setAppearanceMode(event.target.value as MapAppearanceMode)}
                className="w-full min-h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800">
                <option value="light">Claro (padrão)</option>
                <option value="dark">Escuro</option>
                <option value="system">Seguir sistema</option>
                <option value="automatic">Automático (18h às 6h)</option>
              </select>
              <p className="text-xs text-slate-500">Salvo neste aparelho. O modo automático segue o horário local, sem precisar de internet.</p>
            </section>
            <OfflineRegionsPanel />
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-600" />
                Configurações de Privacidade
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Suas informações pessoais, rotas e dados de veículos são 100% privados por padrão.
              </p>
            </div>

            <div className="space-y-4 pt-2 border-t border-slate-100 text-xs">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <strong className="text-slate-800 block">Exibir meu Nível do Viajante publicamente</strong>
                  <span className="text-slate-500">Mostra a medalha Bronze/Prata/Ouro/Diamante na comunidade</span>
                </div>
                <input
                  type="checkbox"
                  checked={profile.showLevelPublicly}
                  onChange={(e) => onUpdateProfile({ ...profile, showLevelPublicly: e.target.checked })}
                  className="rounded text-emerald-600"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <strong className="text-slate-800 block">Exibir histórico de medalhas na comunidade</strong>
                  <span className="text-slate-500">Permite que outros viajantes vejam suas conquistas</span>
                </div>
                <input
                  type="checkbox"
                  checked={profile.showMedalsPublicly}
                  onChange={(e) => onUpdateProfile({ ...profile, showMedalsPublicly: e.target.checked })}
                  className="rounded text-emerald-600"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <strong className="text-slate-800 block">Proteger endereço de partida e chegada</strong>
                  <span className="text-slate-500">Nunca revela o número ou rua residencial ao publicar rotas</span>
                </div>
                <input
                  type="checkbox"
                  checked={true}
                  disabled
                  className="rounded text-emerald-600 opacity-60"
                />
              </label>
            </div>
          </div>
        )}
      </div>
      </div>}

      {/* ================================================= */}
      {/* MODAL: NOVO VEÍCULO COM CONSULTA TÉCNICA INTELIGENTE */}
      {/* ================================================= */}
      {showAddVehicleModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-6 border border-slate-200 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Cadastrar Novo Veículo</h3>
              <button onClick={() => setShowAddVehicleModal(false)} className="text-slate-400">✕</button>
            </div>

            <form onSubmit={handleSaveVehicle} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setVehType('motorcycle')}
                  className={`p-2.5 rounded-xl border font-bold ${
                    vehType === 'motorcycle' ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-slate-200'
                  }`}
                >
                  🏍️ Motocicleta
                </button>
                <button
                  type="button"
                  onClick={() => setVehType('car')}
                  className={`p-2.5 rounded-xl border font-bold ${
                    vehType === 'car' ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-slate-200'
                  }`}
                >
                  🚗 Carro
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Marca</label>
                  <input
                    type="text"
                    value={vehBrand}
                    onChange={(e) => setVehBrand(e.target.value)}
                    placeholder="Ex: Honda, BMW, Chevrolet"
                    className="w-full p-2 rounded-xl border border-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Modelo</label>
                  <input
                    type="text"
                    value={vehModel}
                    onChange={(e) => setVehModel(e.target.value)}
                    placeholder="Ex: CB 500X, Onix, MT-07"
                    className="w-full p-2 rounded-xl border border-slate-200"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Ano</label>
                  <input
                    type="number"
                    value={vehYear}
                    onChange={(e) => setVehYear(parseInt(e.target.value) || 2024)}
                    className="w-full p-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Apelido do Veículo</label>
                  <input
                    type="text"
                    value={vehNickname}
                    onChange={(e) => setVehNickname(e.target.value)}
                    placeholder="Ex: Valente, Bruta, Fiel"
                    className="w-full p-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              {/* Technical specs benchmark lookup button (Requirement #4) */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Base Técnica Inmetro / PBEV</span>
                  <button
                    type="button"
                    onClick={handleLookupSpecs}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[11px]"
                  >
                    Consultar Especificações
                  </button>
                </div>
                {vehBenchmarkNote && (
                  <p className="text-[11px] text-slate-600 italic leading-snug">
                    {vehBenchmarkNote}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Capacidade do Tanque (Litros)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={vehTankLiters}
                    onChange={(e) => setVehTankLiters(parseFloat(e.target.value) || 15)}
                    className="w-full p-2 rounded-xl border border-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Consumo Médio (km/l)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={vehUserConsumption}
                    onChange={(e) => setVehUserConsumption(parseFloat(e.target.value) || 15)}
                    className="w-full p-2 rounded-xl border border-slate-200"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-2xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 shadow-md"
              >
                Salvar Veículo na Garagem
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ================================================= */}
      {/* MODAL: REGISTRAR ABASTECIMENTO (SEÇÃO 5) */}
      {/* ================================================= */}
      {showRefillModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Registrar Abastecimento</h3>
              <button onClick={() => setShowRefillModal(false)} className="text-slate-400">✕</button>
            </div>

            <form onSubmit={handleSaveRefill} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold block mb-1">Veículo Abastecido</label>
                <select
                  value={refillVehicleId}
                  onChange={(e) => setRefillVehicleId(e.target.value)}
                  className="w-full p-2 rounded-xl border border-slate-200"
                >
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.nickname} ({v.brand} {v.model})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Odômetro Atual (km)</label>
                  <input
                    type="number"
                    value={refillOdometer}
                    onChange={(e) => setRefillOdometer(parseInt(e.target.value) || 0)}
                    className="w-full p-2 rounded-xl border border-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Litros Abastecidos</label>
                  <input
                    type="number"
                    step="0.01"
                    value={refillLiters}
                    onChange={(e) => setRefillLiters(parseFloat(e.target.value) || 0)}
                    className="w-full p-2 rounded-xl border border-slate-200"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Preço por Litro (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={refillPrice}
                  onChange={(e) => setRefillPrice(parseFloat(e.target.value) || 0)}
                  className="w-full p-2 rounded-xl border border-slate-200"
                  required
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={refillFullTank}
                  onChange={(e) => setRefillFullTank(e.target.checked)}
                  className="rounded text-emerald-600"
                />
                <span className="font-semibold">Tanque Completo (necessário para calcular consumo real)</span>
              </label>

              <button
                type="submit"
                className="w-full py-3 rounded-2xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 shadow-md"
              >
                Salvar Abastecimento
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

