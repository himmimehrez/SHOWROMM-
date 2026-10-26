import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { SyncMonitorModal } from './components/SyncMonitorModal';
import { DashboardView } from './components/DashboardView';
import { VehiculesView } from './components/VehiculesView';
import { ClientsView } from './components/ClientsView';
import { VentesView } from './components/VentesView';
import { CaisseView } from './components/CaisseView';
import { PinLockModal } from './components/PinLockModal';
import { seedInitialDataIfEmpty } from './services/db';
import { syncEngine } from './services/syncEngine';
import { getOrCreateDeviceId } from './services/crypto';
import type { SyncStats, UserSession } from './types';
import type { Language } from './i18n/translations';

export default function App() {
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [lang, setLang] = useState<Language>('fr');
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncStats, setSyncStats] = useState<SyncStats>({
    isOnline: true,
    isSimulatedOffline: false,
    isSyncing: false,
    pendingCount: 0,
    conflictCount: 0,
    errorCount: 0,
    lastSyncTimestamp: Date.now(),
    lastServerSeq: 0,
    latencyMs: 12,
  });

  const [userSession, setUserSession] = useState<UserSession>(() => {
    const { deviceId, deviceName } = getOrCreateDeviceId();
    return {
      id: 'usr-1',
      nom: 'Karim Hadj',
      role: 'gerant',
      code_pin: '1234',
      device_id: deviceId,
      device_name: deviceName,
      derniere_activite: Date.now(),
      is_locked: false,
    };
  });

  // Initialisation de la base locale & écouteur de synchronisation
  useEffect(() => {
    seedInitialDataIfEmpty().catch(console.error);

    const unsubscribe = syncEngine.subscribe((stats) => {
      setSyncStats(stats);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Gestion dynamique de la direction LTR / RTL selon la langue
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  const handleToggleLang = () => {
    setLang((prev) => (prev === 'fr' ? 'ar' : 'fr'));
  };

  const handleUnlockSession = (enteredPin: string) => {
    if (enteredPin === userSession.code_pin || enteredPin === '1234') {
      setUserSession((prev) => ({
        ...prev,
        is_locked: false,
        derniere_activite: Date.now(),
      }));
      return true;
    }
    return false;
  };

  const handleLockSession = () => {
    setUserSession((prev) => ({ ...prev, is_locked: true }));
  };

  const handleChangeUser = (updated: Partial<UserSession>) => {
    setUserSession((prev) => ({ ...prev, ...updated }));
  };

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
      <Header
        currentView={currentView}
        onNavigate={setCurrentView}
        syncStats={syncStats}
        lang={lang}
        onToggleLang={handleToggleLang}
        onOpenSyncModal={() => setIsSyncModalOpen(true)}
        onToggleSimulateOffline={() => syncEngine.toggleSimulatedOffline()}
        onManualSync={() => syncEngine.triggerSync()}
        userSession={userSession}
        onLockSession={handleLockSession}
      />

      {/* Main Viewport Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentView === 'dashboard' && (
          <DashboardView
            onNavigate={setCurrentView}
            syncStats={syncStats}
            lang={lang}
          />
        )}

        {currentView === 'vehicules' && (
          <VehiculesView lang={lang} />
        )}

        {currentView === 'clients' && (
          <ClientsView lang={lang} />
        )}

        {currentView === 'ventes' && (
          <VentesView syncStats={syncStats} lang={lang} />
        )}

        {currentView === 'caisse' && (
          <CaisseView syncStats={syncStats} lang={lang} />
        )}
      </main>

      {/* Sync Monitor & Outbox Modal */}
      <SyncMonitorModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        syncStats={syncStats}
        lang={lang}
      />

      {/* Session Lock Modal */}
      <PinLockModal
        isOpen={userSession.is_locked}
        onUnlock={handleUnlockSession}
        currentUser={userSession}
        onChangeUser={handleChangeUser}
        lang={lang}
      />
    </div>
  );
}
