import React from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Globe,
  Lock,
  Layers,
  Car,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import type { SyncStats, UserSession } from '../types';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';

interface HeaderProps {
  currentView: string;
  onNavigate: (view: string) => void;
  syncStats: SyncStats;
  lang: Language;
  onToggleLang: () => void;
  onOpenSyncModal: () => void;
  onToggleSimulateOffline: () => void;
  onManualSync: () => void;
  userSession: UserSession;
  onLockSession: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onNavigate,
  syncStats,
  lang,
  onToggleLang,
  onOpenSyncModal,
  onToggleSimulateOffline,
  onManualSync,
  userSession,
  onLockSession,
}) => {
  const t = translations[lang];
  const isEffectivelyOnline = syncStats.isOnline && !syncStats.isSimulatedOffline;

  const navItems = [
    { id: 'dashboard', label: t.navDashboard },
    { id: 'vehicules', label: t.navVehicules },
    { id: 'clients', label: t.navClients },
    { id: 'ventes', label: t.navVentes },
    { id: 'caisse', label: t.navCaisse },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 text-slate-100">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand wordmark single text element */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-2.5 text-left group focus:outline-none"
          >
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:bg-blue-500 transition-colors">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-lg tracking-tight text-white whitespace-nowrap leading-none">
                {t.appName}
              </div>
              <div className="text-[11px] text-slate-400 font-medium whitespace-nowrap mt-0.5">
                DZ Showroom Suite
              </div>
            </div>
          </button>
        </div>

        {/* Zone 2: Navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`whitespace-nowrap transition-colors py-1 ${
                currentView === item.id
                  ? 'text-blue-400 font-semibold border-b-2 border-blue-500'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1 Primary status & actions cluster */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Network & Sync indicator */}
          <button
            onClick={onOpenSyncModal}
            title={isEffectivelyOnline ? t.statusOnline : t.statusOffline}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              isEffectivelyOnline
                ? 'bg-slate-800/80 border-slate-700 text-emerald-400 hover:bg-slate-800'
                : 'bg-amber-950/40 border-amber-800/60 text-amber-300 hover:bg-amber-900/40'
            }`}
          >
            {syncStats.isSyncing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
            ) : isEffectivelyOnline ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="hidden sm:inline whitespace-nowrap">
              {syncStats.isSyncing
                ? t.statusSyncing
                : isEffectivelyOnline
                ? t.statusOnline
                : t.statusOffline}
            </span>
            {syncStats.pendingCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] rounded bg-amber-500 text-slate-950 font-bold tabular-nums">
                {syncStats.pendingCount}
              </span>
            )}
            {syncStats.conflictCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] rounded bg-red-600 text-white font-bold tabular-nums">
                !
              </span>
            )}
          </button>

          {/* Test Offline Toggle */}
          <button
            onClick={onToggleSimulateOffline}
            className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors whitespace-nowrap hidden lg:flex items-center gap-1.5 ${
              syncStats.isSimulatedOffline
                ? 'bg-amber-600 border-amber-500 text-white font-semibold'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="Active la simulation de rupture réseau pour tester la persistance locale"
          >
            {syncStats.isSimulatedOffline ? <AlertTriangle className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{syncStats.isSimulatedOffline ? 'Hors-Ligne Simulé' : t.toggleSimulateOffline}</span>
          </button>

          {/* Language Switcher */}
          <button
            onClick={onToggleLang}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors"
            title="Changer de langue / تغيير اللغة"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{t.toggleLang}</span>
          </button>

          {/* Lock Session */}
          <button
            onClick={onLockSession}
            className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors"
            title="Verrouiller la session (Appareil partagé)"
          >
            <Lock className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sub-bar for mobile navigation */}
      <div className="md:hidden flex items-center justify-around border-t border-slate-800 bg-slate-900/90 px-2 py-2 text-xs overflow-x-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`px-3 py-1 whitespace-nowrap rounded ${
              currentView === item.id
                ? 'text-blue-400 bg-blue-950/60 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </header>
  );
};
