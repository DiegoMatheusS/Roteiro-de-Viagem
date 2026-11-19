import React,{useState} from 'react';
import {AlertTriangle,ChevronRight,Map as MapIcon,Navigation,Palette,ShieldCheck,UserRound,Volume2,VolumeX} from 'lucide-react';
import type {TravelerProfile} from '../types';
import {useMapAppearance} from '../hooks/useMapAppearance';
import {useMapIconDensity} from '../hooks/useMapIconDensity';
import {useVoicePreference} from '../hooks/useVoicePreference';
import type {MapAppearanceMode} from '../services/mapAppearance';
import type {MapIconDensity} from '../services/mapIconDensity';
import {clearAddressHistory} from '../services/addressMemory';
import {OfflineRegionsPanel} from './OfflineRegionsPanel';

type SettingsCategory='mapa'|'navegacao'|'alertas'|'aparencia'|'conta'|'privacidade';
const categories=[
  {id:'mapa',title:'Mapa',icon:MapIcon},
  {id:'navegacao',title:'Navegação',icon:Navigation},
  {id:'alertas',title:'Alertas',icon:AlertTriangle},
  {id:'aparencia',title:'Aparência',icon:Palette},
  {id:'conta',title:'Conta',icon:UserRound},
  {id:'privacidade',title:'Privacidade',icon:ShieldCheck}
] as const;
const densityOptions:{id:MapIconDensity;label:string;detail:string;dots:number}[]=[
  {id:'less',label:'Menos',detail:'Mapa mais limpo',dots:2},
  {id:'moderate',label:'Moderado',detail:'Equilíbrio de informações',dots:4},
  {id:'more',label:'Mais',detail:'Mais locais visíveis',dots:6}
];

export function ProfileSettingsHub({profile,onUpdateProfile,accountLabel,onLogin,onLogout,onOpenProfile}:{
  profile:TravelerProfile;
  onUpdateProfile:(profile:TravelerProfile)=>void;
  accountLabel?:string;
  onLogin:()=>void;
  onLogout:()=>void;
  onOpenProfile:()=>void;
}){
  const [category,setCategory]=useState<SettingsCategory>('mapa');
  const {mode:appearanceMode,setMode:setAppearanceMode}=useMapAppearance();
  const {mode:iconDensity,setMode:setIconDensity}=useMapIconDensity();
  const {enabled:voiceEnabled,setEnabled:setVoiceEnabled}=useVoicePreference();
  const [addressNotice,setAddressNotice]=useState('');
  const [clearingAddresses,setClearingAddresses]=useState(false);

  return <section aria-label="Configurações do RUAVO" className="space-y-4">
    <header className="space-y-1">
      <h2 className="text-lg font-extrabold text-slate-950">Configurações</h2>
      <p className="text-xs text-slate-600">Organize seu mapa, a navegação e as informações da conta.</p>
    </header>
    <nav aria-label="Categorias de configurações" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {categories.map(({id,title,icon:Icon})=><button type="button" key={id}
        onClick={()=>setCategory(id)} aria-pressed={category===id}
        className={`min-h-14 rounded-xl border px-3 py-2 text-sm font-semibold flex items-center gap-2 text-left transition-colors
          ${category===id?'border-blue-600 bg-blue-50 text-blue-800 shadow-sm':'border-slate-200 bg-white text-slate-700 active:bg-slate-50'}`}>
        <Icon size={18} strokeWidth={1.8} aria-hidden="true"/>{title}
      </button>)}
    </nav>
    {category==='mapa'&&<div className="space-y-4" role="region" aria-label="Preferências do mapa">
      <section className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
        <h3 className="text-sm font-extrabold text-slate-900">Quantidade de ícones</h3>
        <p className="text-xs text-slate-600">Escolha a quantidade de locais exibidos no mapa inicial. O Explorar continua mostrando todos os ícones disponíveis.</p>
        <div role="group" aria-label="Densidade dos ícones" className="grid grid-cols-3 gap-2">
          {densityOptions.map(option=><button key={option.id} type="button"
            onClick={()=>setIconDensity(option.id)} aria-pressed={iconDensity===option.id}
            className={`rounded-xl border p-2 flex flex-col items-center gap-2 min-h-[105px] text-center
              ${iconDensity===option.id?'border-blue-600 bg-blue-50 ring-1 ring-blue-600':'border-slate-200 bg-white'}`}>
            <span aria-hidden="true" className="grid grid-cols-3 gap-1 w-12 h-9 content-center">
              {Array.from({length:option.dots},(_,i)=><span key={i} className="w-2.5 h-2.5 rounded-full bg-blue-500 border border-white shadow-sm"/>)}
            </span>
            <strong className="text-xs text-slate-900">{option.label}</strong>
            <small className="text-[10px] leading-tight text-slate-500">{option.detail}</small>
          </button>)}
        </div>
        <p className="text-xs text-slate-500" role="status">Selecionado: {densityOptions.find(item=>item.id===iconDensity)?.label}. Salvo neste aparelho.</p>
      </section>
      <OfflineRegionsPanel/>
    </div>}
    {category==='navegacao'&&<section role="region" aria-label="Preferências de navegação"
      className="bg-white rounded-2xl p-4 border border-slate-200 space-y-4">
      <h3 className="text-sm font-extrabold">Orientações durante o percurso</h3>
      <label className="flex items-center justify-between gap-4">
        <span className="min-w-0 flex items-center gap-2">
          {voiceEnabled?<Volume2 size={20} className="text-blue-600"/>:<VolumeX size={20} className="text-slate-500"/>}
          <span><strong className="block text-sm">Orientações por voz</strong>
            <small className="block text-xs text-slate-500">Instruções faladas nas conversões, quando disponíveis no dispositivo.</small></span>
        </span>
        <input type="checkbox" aria-label="Ativar orientações por voz"
          className="w-5 h-5 accent-blue-600 shrink-0" checked={voiceEnabled}
          onChange={event=>setVoiceEnabled(event.target.checked)}/>
      </label>
      <p className="text-xs text-slate-600">A navegação continua mostrando a rota, as conversões e o GPS mesmo com a voz desligada.</p>
    </section>}
    {category==='alertas'&&<section role="region" aria-label="Preferências de alertas"
      className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
      <h3 className="text-sm font-extrabold text-slate-900">Alertas no mapa</h3>
      <p className="text-xs text-slate-600">Ocorrências aprovadas aparecem no mapa inicial e durante a navegação, sem filtro de raio. Os alertas na área visualizada são priorizados pela gravidade.</p>
      <div className="space-y-2 text-xs">
        <div className="rounded-lg bg-red-50 border border-red-100 text-red-900 p-3">Críticos: acidentes, interdições e perigos imediatos</div>
        <div className="rounded-lg bg-amber-50 border border-amber-100 text-amber-900 p-3">Alta prioridade: obras, congestionamentos e obstáculos</div>
        <div className="rounded-lg bg-blue-50 border border-blue-100 text-blue-900 p-3">Informativos: radares e outras ocorrências</div>
      </div>
      <p className="text-xs text-slate-600">Para registrar um alerta, use o botão disponível somente durante a navegação ativa.</p>
    </section>}
    {category==='aparencia'&&<section role="region" aria-label="Preferências de aparência"
      className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
      <h3 className="text-sm font-extrabold">Aparência do mapa</h3>
      <label htmlFor="role-map-theme" className="block text-xs font-medium text-slate-700">Tema do mapa</label>
      <select id="role-map-theme" value={appearanceMode}
        onChange={event=>setAppearanceMode(event.target.value as MapAppearanceMode)}
        className="w-full min-h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800">
        <option value="light">Claro (padrão)</option>
        <option value="dark">Escuro</option>
        <option value="system">Seguir sistema</option>
        <option value="automatic">Automático (18h às 6h)</option>
      </select>
      <p className="text-xs text-slate-500">Salvo neste aparelho. O modo automático segue o horário local.</p>
    </section>}
    {category==='conta'&&<section role="region" aria-label="Configurações da conta"
      className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
      <h3 className="text-sm font-extrabold">Minha conta</h3>
      <p className="text-xs text-slate-600">{accountLabel?`Conectado: ${accountLabel}`:'Entre na sua conta para sincronizar as viagens.'}</p>
      <button type="button" onClick={onOpenProfile}
        className="w-full rounded-xl border border-slate-200 px-3 py-3 flex items-center justify-between text-sm font-semibold">
        Meu perfil e nível <ChevronRight size={18}/>
      </button>
      <button type="button" onClick={accountLabel?onLogout:onLogin}
        className={`w-full rounded-xl px-3 py-3 font-semibold text-sm ${accountLabel?'border border-rose-200 bg-white text-rose-700':'bg-blue-600 text-white'}`}>
        {accountLabel?'Sair da conta':'Entrar / Criar conta'}
      </button>
    </section>}
    {category==='privacidade'&&<section role="region" aria-label="Configurações de Privacidade"
      className="bg-white rounded-2xl p-4 border border-slate-200 space-y-4">
      <h3 className="text-sm font-extrabold text-slate-900">Configurações de Privacidade</h3>
      <p className="text-xs text-slate-600">Controle o que aparece para outras pessoas e apague os endereços recentes armazenados para busca.</p>
      <label className="flex items-center justify-between gap-4 text-xs">
        <span><strong className="block text-slate-800">Exibir meu Nível do Viajante publicamente</strong>
          <small className="text-slate-500">Mostra sua medalha na comunidade.</small></span>
        <input type="checkbox" className="w-5 h-5 accent-blue-600" checked={profile.showLevelPublicly}
          onChange={event=>onUpdateProfile({...profile,showLevelPublicly:event.target.checked})}/>
      </label>
      <label className="flex items-center justify-between gap-4 text-xs">
        <span><strong className="block text-slate-800">Exibir histórico de medalhas na comunidade</strong>
          <small className="text-slate-500">Permite que outros viajantes vejam suas conquistas.</small></span>
        <input type="checkbox" className="w-5 h-5 accent-blue-600" checked={profile.showMedalsPublicly}
          onChange={event=>onUpdateProfile({...profile,showMedalsPublicly:event.target.checked})}/>
      </label>
      <label className="flex items-center justify-between gap-4 text-xs">
        <span><strong className="block text-slate-800">Proteger endereço de partida e chegada</strong>
          <small className="text-slate-500">Oculta os dados residenciais ao compartilhar rotas.</small></span>
        <input type="checkbox" checked disabled className="w-5 h-5 accent-blue-600 opacity-70"/>
      </label>
      <div className="pt-3 border-t border-slate-100 space-y-2">
        <h4 className="text-sm font-semibold">Endereços recentes</h4>
        <p className="text-xs text-slate-600">Os endereços de origem e destino ficam guardados para facilitar novas buscas.</p>
        <button type="button" disabled={clearingAddresses}
          className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 disabled:opacity-50"
          onClick={async()=>{
            setClearingAddresses(true);setAddressNotice('');
            try{await clearAddressHistory();setAddressNotice('Histórico de endereços limpo.');}
            catch{setAddressNotice('Não foi possível limpar agora. Tente novamente com conexão.');}
            finally{setClearingAddresses(false);}
          }}>{clearingAddresses?'Limpando…':'Limpar endereços recentes'}</button>
        {addressNotice&&<p role="status" className="text-xs text-slate-600">{addressNotice}</p>}
      </div>
    </section>}
  </section>;
}
