import React, { useEffect, useState } from 'react';
import { BookOpen, Bookmark, ChevronRight, Compass, Map, Menu, Navigation2, UserRound, X, MoreHorizontal } from 'lucide-react';

export type MainTabType = 'inicio' | 'mapa' | 'passeios' | 'salvos' | 'ajustes';
interface NavigationTabBarProps {
  activeTab: MainTabType;
  onTabChange: (tab: MainTabType) => void;
  hasActiveConvoy?: boolean;
  userName?: string | null;
  signedIn?: boolean;
}
const sections: { id: MainTabType; label: string; icon: React.ElementType; detail: string }[] = [
  { id: 'inicio', label: 'Início', icon: Compass, detail: 'Buscar destino ou criar um novo rolê' },
  { id: 'mapa', label: 'Mapa', icon: Map, detail: 'Explorar ruas e acompanhar a rota' },
  { id: 'passeios', label: 'Passeios', icon: BookOpen, detail: 'Descobrir lugares para conhecer' },
  { id: 'salvos', label: 'Minhas viagens', icon: Bookmark, detail: 'Roteiros salvos e histórico' },
  { id: 'ajustes', label: 'Perfil', icon: UserRound, detail: 'Conta, garagem e preferências' }
];
export function NavigationTabBar({ activeTab, onTabChange, hasActiveConvoy = false, userName, signedIn = false }: NavigationTabBarProps) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', dismiss);
    return () => window.removeEventListener('keydown', dismiss);
  }, [open]);
  useEffect(()=>{
    if(!open)return;
    const close=(event:Event)=>{event.preventDefault();setOpen(false);};
    window.addEventListener('rdv:close-overlay',close);
    return()=>window.removeEventListener('rdv:close-overlay',close);
  },[open]);
  const navigate = (tab: MainTabType) => { onTabChange(tab); setOpen(false); };
  const displayName = signedIn && userName?.trim() ? userName.trim() : 'Entrar ou criar conta';
  const initials = signedIn && userName?.trim()
    ? userName.trim().split(/\s+/).slice(0, 2).map(word => word.charAt(0).toLocaleUpperCase('pt-BR')).join('')
    : null;
  const bottomTabs: { id: MainTabType; label: string; icon: React.ElementType }[] = [
    { id:'inicio', label:'Início', icon:Map },
    { id:'passeios', label:'Explorar', icon:Compass },
    { id:'salvos', label:'Viagens', icon:Bookmark },
    { id:'ajustes', label:'Perfil', icon:UserRound }
  ];
  return <>
    {(activeTab==='inicio'||activeTab==='passeios'||activeTab==='salvos'||activeTab==='ajustes') && <nav className="rdv-figma-bottom-nav" aria-label="Navegação principal">
      {bottomTabs.map(tab => {
        const Icon=tab.icon;
        const active=activeTab===tab.id;
        return <button key={tab.id} type="button" aria-label={`Aba ${tab.label}`} aria-current={active?'page':undefined}
          onClick={()=>navigate(tab.id)} className={`rdv-figma-bottom-link ${active?'is-current':''}`}>
          <span className="rdv-figma-bottom-icon"><Icon size={20} strokeWidth={1.7}/></span>
          <span>{tab.label}</span>
        </button>;
      })}
    </nav>}
    <button type="button" aria-label="Abrir menu" aria-expanded={open} aria-controls="role-menu"
      onClick={() => setOpen(true)}
      className={activeTab==='inicio' ? "rdv-figma-overflow fixed right-3 top-3 z-[61] w-9 h-9 rounded-full bg-white/90 border border-slate-200/80 shadow-sm flex items-center justify-center text-slate-700 active:scale-95 transition-transform" : (activeTab==='passeios'||activeTab==='salvos'||activeTab==='ajustes') ? "fixed right-3 top-[63px] z-[61] w-10 h-10 rounded-full flex items-center justify-center bg-transparent text-slate-700 active:scale-95 transition-transform" : "fixed left-4 top-5 z-[61] w-12 h-12 rounded-full bg-white border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,.13)] flex items-center justify-center text-slate-900 active:scale-95 transition-transform"}>
      {(activeTab==='passeios'||activeTab==='salvos'||activeTab==='ajustes')?<MoreHorizontal size={23} strokeWidth={2}/>:<Menu size={22} strokeWidth={2.1}/>}
    </button>
    {/* Mantido montado para animar tanto a subida como a descida; oculto da navegação por teclado quando fechado. */}
    <div className={`fixed inset-0 z-[82] bg-slate-950/45 flex flex-col justify-end transition-opacity duration-300 ease-out ${open ? 'opacity-100 visible pointer-events-auto' : 'opacity-0 invisible pointer-events-none'}`}
      style={{transitionProperty:'opacity, visibility'}}
      role="presentation" aria-hidden={!open} inert={!open}
      onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <nav id="role-menu" role="dialog" aria-modal={open} aria-label="Menu do Rolê"
        className={`bg-white rounded-t-[30px] border-t border-slate-100 w-full max-w-xl mx-auto shadow-[0_-14px_50px_rgba(15,23,42,.16)] overflow-y-auto max-h-[90dvh] pb-[max(24px,env(safe-area-inset-bottom))] transform-gpu will-change-transform transition-transform duration-[340ms] ease-[cubic-bezier(.22,1,.36,1)] ${open ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="flex items-center justify-center h-8">
          <div className="w-12 h-1.5 rounded-full bg-slate-300" aria-hidden="true" />
        </div>
        <div className="flex items-center gap-3 px-5 pt-1 pb-5">
          <button type="button" onClick={() => navigate('ajustes')} aria-label="Abrir meu perfil"
            className="group min-w-0 flex-1 flex items-center gap-3 rounded-[18px] p-1.5 -ml-1.5 text-left active:bg-slate-50 focus-visible:outline-blue-600">
            <span className="w-14 h-14 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 p-[2px] shadow-sm">
              <span className="w-full h-full rounded-full bg-white flex items-center justify-center text-blue-700 font-extrabold text-base">
                {initials || <UserRound size={25} strokeWidth={1.9}/>}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <strong className="text-[17px] font-extrabold tracking-tight block text-slate-900 truncate">{displayName}</strong>
              <span className="text-[11px] text-slate-500 block mt-0.5">{signedIn ? 'Ver meu perfil e garagem' : 'Acessar meu perfil'}</span>
            </span>
            <ChevronRight size={18} className="text-slate-400 shrink-0"/>
          </button>
          <button type="button" aria-label="Fechar menu" onClick={() => setOpen(false)}
            className="w-10 h-10 shrink-0 rounded-full bg-slate-100 flex items-center justify-center text-slate-700"><X size={20}/></button>
        </div>
        <div className="px-5 pb-4">
          <button type="button" onClick={() => navigate('inicio')}
            className="w-full flex items-center gap-3 rounded-[20px] bg-blue-600 text-white py-3.5 px-4 text-left shadow-[0_5px_14px_rgba(37,99,235,.18)]">
            <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center"><Navigation2 size={21}/></span>
            <span className="flex-1"><strong className="block text-sm">Começar um rolê</strong><span className="text-xs text-blue-100">Escolha para onde quer ir</span></span>
            <ChevronRight size={19}/>
          </button>
        </div>
        <div className="px-5">
          <p className="text-[10px] uppercase tracking-[.16em] font-bold text-slate-400 px-2 mb-2">Explorar</p>
          <div className="bg-white rounded-[22px] border border-slate-100 overflow-hidden">
            {sections.map((tab, index) => {
              const Icon = tab.icon, active = activeTab === tab.id;
              return <button type="button" key={tab.id} aria-label={tab.label} aria-current={active ? 'page' : undefined}
                onClick={() => navigate(tab.id)}
                className={`relative w-full px-3.5 py-3.5 text-left flex items-center gap-3 min-h-[69px] ${index ? 'border-t border-slate-100' : ''} ${active ? 'bg-blue-50/70' : 'bg-white active:bg-slate-50'}`}>
                {active && <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r bg-blue-600" />}
                <span className={`w-10 h-10 rounded-[13px] flex items-center justify-center ${active ? 'bg-blue-600 text-white' : tab.id === 'ajustes' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                  <Icon size={20} strokeWidth={1.9}/>
                </span>
                <span className="flex-1 min-w-0"><strong className={`block text-[13px] ${active ? 'text-blue-800' : 'text-slate-900'}`}>{tab.label}</strong>
                  <span className="block text-[11px] text-slate-500 truncate mt-0.5">{tab.detail}</span>
                </span>
                <ChevronRight className={active ? 'text-blue-700' : 'text-slate-300'} size={18}/>
              </button>;
            })}
          </div>
        </div>
        {hasActiveConvoy && <p role="status" className="mx-6 mt-4 px-3 py-2.5 bg-emerald-50 text-emerald-900 rounded-xl text-xs">Você participa de um comboio ativo.</p>}
      </nav>
    </div>
  </>;
}
