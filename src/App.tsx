import React, { useCallback, useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { AppProvider, useApp } from './app-context';
import { ToastProvider } from './components/toast';
import { Layout, pageAllowed } from './components/Layout';
import { EmptyState } from './components/ui';
import { hasAnyUser, logout, restoreSession } from './lib/auth';
import type { SessionUser } from './lib/types';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { VehiculesPage } from './pages/Vehicules';
import { MouvementsPage } from './pages/Mouvements';
import { AchatsPage } from './pages/Achats';
import { FournisseursPage } from './pages/Fournisseurs';
import { VentesPage } from './pages/Ventes';
import { ClientsPage } from './pages/Clients';
import { CaissePage } from './pages/Caisse';
import { DepensesPage } from './pages/Depenses';
import { RapportsPage } from './pages/Rapports';
import { UtilisateursPage } from './pages/Utilisateurs';
import { ParametresPage } from './pages/Parametres';
import { AuditPage } from './pages/Audit';

const INACTIVITY_MS = 15 * 60 * 1000;

function Router() {
  const { route, can } = useApp();
  if (!pageAllowed(route.page, can)) {
    return <EmptyState icon={<ShieldAlert className="h-8 w-8" />} title="Accès non autorisé" text="Votre profil ne donne pas accès à cette page. Demandez à un administrateur si vous en avez besoin." />;
  }
  switch (route.page) {
    case 'dashboard': return <DashboardPage />;
    case 'vehicules': return <VehiculesPage />;
    case 'mouvements': return <MouvementsPage />;
    case 'achats': return <AchatsPage />;
    case 'fournisseurs': return <FournisseursPage />;
    case 'ventes': return <VentesPage />;
    case 'clients': return <ClientsPage />;
    case 'caisse': return <CaissePage />;
    case 'depenses': return <DepensesPage />;
    case 'rapports': return <RapportsPage />;
    case 'utilisateurs': return <UtilisateursPage />;
    case 'parametres': return <ParametresPage />;
    case 'audit': return <AuditPage />;
  }
}

export default function App() {
  const [state, setState] = useState<{ loading: boolean; user: SessionUser | null; firstRun: boolean }>({ loading: true, user: null, firstRun: false });

  useEffect(() => {
    (async () => {
      const user = await restoreSession();
      const firstRun = !(await hasAnyUser());
      setState({ loading: false, user, firstRun });
    })();
  }, []);

  const handleLogout = useCallback(async (reason?: string) => {
    await logout(state.user, reason);
    setState((s) => ({ ...s, user: null }));
  }, [state.user]);

  // Déconnexion automatique après 15 minutes sans activité (poste partagé au showroom)
  useEffect(() => {
    if (!state.user) return;
    let timer = setTimeout(() => handleLogout('Déconnexion automatique (inactivité)'), INACTIVITY_MS);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => handleLogout('Déconnexion automatique (inactivité)'), INACTIVITY_MS);
    };
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [state.user, handleLogout]);

  if (state.loading) return <div className="flex h-full items-center justify-center text-muted">Chargement…</div>;

  return (
    <ToastProvider>
      {state.user ? (
        <AppProvider user={state.user} onLogout={() => handleLogout()}>
          <Layout>
            <Router />
          </Layout>
        </AppProvider>
      ) : (
        <LoginPage firstRun={state.firstRun} onLoggedIn={(user) => { window.location.hash = '/dashboard'; setState({ loading: false, user, firstRun: false }); }} />
      )}
    </ToastProvider>
  );
}
