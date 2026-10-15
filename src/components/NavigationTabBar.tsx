import React, { useState } from 'react';
import { BookOpen, Bookmark, Compass, Map, Menu, UserRound, X } from 'lucide-react';

export type MainTabType = 'inicio' | 'mapa' | 'passeios' | 'salvos' | 'ajustes';
interface NavigationTabBarProps {
  activeTab: MainTabType;
  onTabChange: (tab: MainTabType) => void;
  hasActiveConvoy?: boolean;
}
const sections: { id:MainTabType; label:string; icon:React.ElementType; detail:string }[] = [
  {id:'inicio',label:'Início',icon:Compass,detail:'Pesquisar e sair para um rolê'},
  {id:'mapa',label:'Mapa',icon:Map,detail:'Ver o trajeto'},
  {id:'passeios',label:'Passeios',icon:BookOpen,detail:'Conhecer novas rotas'},
  {id:'salvos',label:'Minhas viagens',icon:Bookmark,detail:'Roteiros e histórico'},
  {id:'ajustes',label:'Perfil',icon:UserRound,detail:'Minha Garagem, conta e configurações'}
];
export function NavigationTabBar({activeTab,onTabChange}:NavigationTabBarProps) {
  const [open,setOpen]=useState(false);
  return <>
    <button type="button" aria-label="Abrir menu" aria-expanded={open} onClick={()=>setOpen(true)}
      className="fixed left-4 top-5 z-[61] bg-white w-12 h-12 rounded-full border border-slate-100 shadow-lg flex items-center justify-center text-slate-800">
      <Menu size={23}/>
    </button>
    {open && <div className="fixed inset-0 z-[82] bg-slate-950/45 flex flex-col justify-end" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false);}}>
      <nav role="dialog" aria-modal="true" aria-label="Menu do Rolê" className="bg-white rounded-t-[30px] px-5 pt-3 pb-8 w-full max-w-xl mx-auto shadow-2xl">
        <div className="flex justify-between items-center pb-3"><span className="w-10 h-1.5 rounded-full bg-slate-300 ml-auto mr-auto"/><button aria-label="Fechar menu" onClick={()=>setOpen(false)}><X size={21}/></button></div>
        <h2 className="font-extrabold text-xl mb-3">Rolê</h2>
        <div className="space-y-2">
          {sections.map(tab=>{
            const Icon=tab.icon;
            return <button type="button" key={tab.id} aria-current={activeTab===tab.id?'page':undefined}
              onClick={()=>{onTabChange(tab.id);setOpen(false);}}
              className={`w-full px-4 py-3 text-left rounded-2xl flex items-center gap-3 border ${activeTab===tab.id?'bg-blue-50 border-blue-300':'bg-white border-slate-100'}`}>
              <span className="w-10 h-10 flex items-center justify-center text-blue-700 bg-blue-50 rounded-xl"><Icon size={20}/></span>
              <span className="flex-1"><strong className="block text-sm text-slate-900">{tab.label}</strong><small className="block text-xs text-slate-500">{tab.detail}</small></span>
            </button>;
          })}
        </div>
      </nav>
    </div>}
  </>;
}
