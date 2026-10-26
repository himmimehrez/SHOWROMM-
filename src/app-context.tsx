import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getSettings, DEFAULT_SETTINGS } from './lib/services';
import { can as canFn, type Permission } from './lib/permissions';
import { translate, type I18nKey, type Lang } from './lib/i18n';
import type { SessionUser, ShopSettings } from './lib/types';

export type Page =
  | 'dashboard' | 'vehicules' | 'mouvements' | 'achats' | 'fournisseurs' | 'ventes' | 'clients'
  | 'caisse' | 'depenses' | 'rapports' | 'utilisateurs' | 'parametres' | 'audit';

export interface Route { page: Page; params: Record<string, string> }

interface AppCtx {
  user: SessionUser;
  settings: ShopSettings;
  route: Route;
  go: (page: Page, params?: Record<string, string>) => void;
  can: (p: Permission) => boolean;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: I18nKey) => string;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  logout: () => void;
}

const Ctx = createContext<AppCtx | null>(null);

const PAGES: Page[] = ['dashboard', 'vehicules', 'mouvements', 'achats', 'fournisseurs', 'ventes', 'clients', 'caisse', 'depenses', 'rapports', 'utilisateurs', 'parametres', 'audit'];

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
  try { localStorage.setItem(key, value); } catch { /* préférences non mémorisées */ }
}

export function AppProvider({ user, onLogout, children }: { user: SessionUser; onLogout: () => void; children: React.ReactNode }) {
  const [route, setRoute] = useState<Route>(parseHash);
  const [lang, setLangState] = useState<Lang>(() => readPref(`smdz_lang_${user.id}`, 'fr'));
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => readPref(`smdz_theme_${user.id}`, 'light'));
  const settings = useLiveQuery(() => getSettings(), [], DEFAULT_SETTINGS);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const go = useCallback((page: Page, params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    window.location.hash = `/${page}${q ? `?${q}` : ''}`;
  }, []);

  const value: AppCtx = {
    user,
    settings,
    route,
    go,
    can: (p) => canFn(user, p),
    lang,
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
