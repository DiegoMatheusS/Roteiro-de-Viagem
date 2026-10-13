import React from 'react';
import { Compass, MapPin, Map, Bookmark, Settings } from 'lucide-react';

export type MainTabType = 'inicio' | 'mapa' | 'passeios' | 'salvos' | 'ajustes';

interface NavigationTabBarProps {
  activeTab: MainTabType;
  onTabChange: (tab: MainTabType) => void;
  hasActiveConvoy?: boolean;
}

export const NavigationTabBar: React.FC<NavigationTabBarProps> = ({
  activeTab,
  onTabChange,
  hasActiveConvoy = false
}) => {
  const tabs: { id: MainTabType; label: string; icon: React.ElementType }[] = [
    { id: 'inicio', label: 'Início', icon: Compass },
    { id: 'mapa', label: 'Mapa', icon: Map },
    { id: 'passeios', label: 'Passeios', icon: MapPin },
    { id: 'salvos', label: 'Salvos', icon: Bookmark },
    { id: 'ajustes', label: 'Ajustes', icon: Settings }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 safe-bottom">
      <div className="max-w-lg mx-auto grid grid-cols-5 items-center h-16 px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors relative cursor-pointer ${
                isActive 
                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold' 
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-normal'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
              </div>
              <span className="text-[10px] sm:text-[11px] tracking-tight mt-1 truncate">
                {tab.label}
              </span>
              {isActive && (
                <span className="absolute bottom-1 w-1 h-1 bg-emerald-600 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
