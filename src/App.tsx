import React, { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, Hourglass, Settings2 } from 'lucide-react';
import { AppProvider, useApp } from './app-context';
import { ToastProvider } from './components/toast';
import { Layout, pageAllowed } from './components/Layout';
import { Button, EmptyState } from './components/ui';
import { initBackend, ConfigError } from './lib/backend';
import { getBackend, invalidate, setBackend, useData } from './lib/data';
import type { Profile, ShopSettings } from './lib/types';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { VehiculesPage } from './pages/Vehicules';
import { MouvementsPage } from './pages/Mouvements';
import { AchatsPage } from './pages/Achats';
import { FournisseursPage } from './pages/Fournisseurs';
import { VentesPage } from './pages/Ventes';
import { ClientsPage } from './pages/Clients';
import { PaiementsPage } from './pages/Paiements';
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
    case 'paiements': return <PaiementsPage />;
    case 'caisse': return <CaissePage />;
    case 'depenses': return <DepensesPage />;
    case 'rapports': return <RapportsPage />;
    case 'utilisateurs': return <UtilisateursPage />;
    case 'parametres': return <ParametresPage />;
    case 'audit': return <AuditPage />;
  }
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-full items-center justify-center p-6">{children}</div>;
}

/** Une fois connecté : profil, paramètres, puis l'application */
function Session({ uid, onLogout }: { uid: string; onLogout: () => void }) {
  const data = useData(`session:${uid}`, async () => {
    const b = getBackend();
    const [profile] = await b.select<Profile>('profiles', { eq: { id: uid } });
    const [settings] = profile?.actif ? await b.select<{ data: ShopSettings }>('settings') : [];
    return { profile: profile ?? null, settings: settings?.data ?? null };
  });

  // Déconnexion automatique après 15 minutes sans activité (poste partagé)
  useEffect(() => {
    let timer = setTimeout(onLogout, INACTIVITY_MS);
    const reset = () => { clearTimeout(timer); timer = setTimeout(onLogout, INACTIVITY_MS); };
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => { clearTimeout(timer); events.forEach((e) => window.removeEventListener(e, reset)); };
  }, [onLogout]);

  if (!data) return <Centered><span className="text-muted">Chargement…</span></Centered>;
  if (!data.profile || !data.profile.actif) {
    return (
      <Centered>
        <div className="max-w-md rounded-xl border border-line bg-surface p-6">
          <EmptyState
            icon={<Hourglass className="h-8 w-8" />}
            title="Compte en attente d'activation"
            text={`Votre compte ${data.profile?.email ?? ''} est créé. Un administrateur doit maintenant l'activer et vous attribuer un rôle (page Utilisateurs). Reconnectez-vous ensuite.`}
            action={<Button onClick={onLogout}>Se déconnecter</Button>}
          />
        </div>
      </Centered>
    );
  }
  return (
    <AppProvider user={data.profile} settings={data.settings!} onLogout={onLogout}>
      <Layout>
        <Router />
      </Layout>
    </AppProvider>
  );
}

export default function App() {
  const [state, setState] = useState<{ phase: 'init' | 'ready' | 'error'; uid: string | null; error?: string; config?: boolean }>({ phase: 'init', uid: null });

  useEffect(() => {
    let unsub = () => {};
    initBackend()
      .then(async (b) => {
        setBackend(b);
        const uid = await b.currentUserId();
        setState({ phase: 'ready', uid });
        unsub = b.onAuthChange(async () => {
          invalidate();
          setState({ phase: 'ready', uid: await b.currentUserId() });
        });
      })
      .catch((e: Error) => setState({ phase: 'error', uid: null, error: e.message, config: e instanceof ConfigError }));
    return () => unsub();
  }, []);

  const logout = useCallback(async () => {
    await getBackend().signOut();
    window.location.hash = '';
    setState({ phase: 'ready', uid: null });
  }, []);

  if (state.phase === 'init') return <Centered><span className="text-muted">Démarrage…</span></Centered>;
  if (state.phase === 'error') {
    return (
      <Centered>
        <div className="max-w-md rounded-xl border border-line bg-surface p-6">
          <EmptyState icon={<Settings2 className="h-8 w-8" />} title={state.config ? 'Application non configurée' : 'Démarrage impossible'} text={state.error} />
        </div>
      </Centered>
    );
  }

  return (
    <ToastProvider>
      {state.uid
        ? <Session key={state.uid} uid={state.uid} onLogout={logout} />
        : <LoginPage onLoggedIn={async () => { window.location.hash = '/dashboard'; setState({ phase: 'ready', uid: await getBackend().currentUserId() }); }} />}
    </ToastProvider>
  );
}
