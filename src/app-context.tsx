import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTable } from './lib/data';
import { translate, type I18nKey, type Lang } from './lib/i18n';
import type { Permission } from './lib/permissions';
import type { Profile, ShopSettings } from './lib/types';

export type Page =
  | 'dashboard' | 'vehicules' | 'mouvements' | 'achats' | 'fournisseurs' | 'ventes' | 'clients' | 'paiements'
  | 'caisse' | 'depenses' | 'rapports' | 'utilisateurs' | 'parametres' | 'audit';

export interface Route { page: Page; params: Record<string, string> }

interface AppCtx {
  user: Profile;
  settings: ShopSettings;
  route: Route;
  go: (page: Page, params?: Record<string, string>) => void;
  can: (p: Permission | string) => boolean;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: I18nKey) => string;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  logout: () => void;
}

const Ctx = createContext<AppCtx | null>(null);

const PAGES: Page[] = ['dashboard', 'vehicules', 'mouvements', 'achats', 'fournisseurs', 'ventes', 'clients', 'paiements', 'caisse', 'depenses', 'rapports', 'utilisateurs', 'parametres', 'audit'];

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const page = (PAGES.includes(path as Page) ? path : 'dashboard') as Page;
  return { page, params: Object.fromEntries(new URLSearchParams(query)) };
}

function readPref<T extends string>(key: string, fallback: T): T {
  try { return (localStorage.getItem(key) as T) || fallback; } catch { return fallback; }
}
function writePref(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* préférence non mémorisée */ }
}

export function AppProvider({ user, settings, onLogout, children }: { user: Profile; settings: ShopSettings; onLogout: () => void; children: React.ReactNode }) {
  const [route, setRoute] = useState<Route>(parseHash);
  const [lang, setLangState] = useState<Lang>(() => readPref(`smdz_lang_${user.id}`, 'fr'));
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => readPref(`smdz_theme_${user.id}`, 'light'));
  const perms = useTable<{ role: string; perm: string }>('role_permissions', { eq: { role: user.role } });
  const permSet = useMemo(() => new Set((perms ?? []).map((p) => p.perm)), [perms]);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const go = useCallback((page: Page, params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    window.location.hash = `/${page}${q ? `?${q}` : ''}`;
  }, []);

  const can = useCallback((p: string) => permSet.has(p), [permSet]);

  if (!perms) return <div className="flex h-full items-center justify-center text-muted">Chargement des droits…</div>;

  const value: AppCtx = {
    user, settings, route, go, can, lang,
    setLang: (l) => { setLangState(l); writePref(`smdz_lang_${user.id}`, l); },
    t: (k) => translate(lang, k),
    theme,
    setTheme: (t) => { setThemeState(t); writePref(`smdz_theme_${user.id}`, t); },
    logout: onLogout,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp hors AppProvider');
  return ctx;
}
