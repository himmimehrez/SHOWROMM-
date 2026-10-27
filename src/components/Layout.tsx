import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard, BarChart3, Car, ArrowLeftRight, PackageCheck, Truck, Receipt, Users, Wallet, Banknote,
  UserCog, Settings, ScrollText, Bell, Search, Plus, Menu, X, LogOut, Moon, Languages, CircleDot, FileCheck2, WifiOff,
} from 'lucide-react';
import { useApp, type Page } from '../app-context';
import { useTable, useLoadError } from '../lib/data';
import { useAlerts, useOpenCash } from '../lib/hooks';
import { BACKEND_KIND } from '../lib/backend';
import { ROLE_LABELS, type Permission } from '../lib/permissions';
import { date, da } from '../lib/format';
import type { I18nKey } from '../lib/i18n';
import type { Client, Vehicule, Vente } from '../lib/types';
import { Button, cx } from './ui';

interface NavItem { page: Page; key: I18nKey; icon: React.ElementType; perm?: Permission }

const NAV: { group: I18nKey; items: NavItem[] }[] = [
  { group: 'nav.pilotage', items: [
    { page: 'dashboard', key: 'nav.dashboard', icon: LayoutDashboard },
    { page: 'rapports', key: 'nav.rapports', icon: BarChart3, perm: 'rapports.voir' },
  ] },
  { group: 'nav.commercial', items: [
    { page: 'ventes', key: 'nav.ventes', icon: Receipt },
    { page: 'clients', key: 'nav.clients', icon: Users },
  ] },
  { group: 'nav.parc', items: [
    { page: 'vehicules', key: 'nav.vehicules', icon: Car },
    { page: 'mouvements', key: 'nav.mouvements', icon: ArrowLeftRight },
    { page: 'achats', key: 'nav.achats', icon: PackageCheck, perm: 'achats.voir' },
    { page: 'fournisseurs', key: 'nav.fournisseurs', icon: Truck, perm: 'fournisseurs.gerer' },
  ] },
  { group: 'nav.tresorerie', items: [
    { page: 'paiements', key: 'nav.paiements', icon: FileCheck2, perm: 'paiements.valider' },
    { page: 'caisse', key: 'nav.caisse', icon: Wallet, perm: 'caisse.voir' },
    { page: 'depenses', key: 'nav.depenses', icon: Banknote, perm: 'depenses.voir' },
  ] },
  { group: 'nav.admin', items: [
    { page: 'utilisateurs', key: 'nav.utilisateurs', icon: UserCog, perm: 'utilisateurs.gerer' },
    { page: 'parametres', key: 'nav.parametres', icon: Settings, perm: 'parametres.gerer' },
    { page: 'audit', key: 'nav.audit', icon: ScrollText, perm: 'audit.voir' },
  ] },
];

export function pageAllowed(page: Page, can: (p: string) => boolean) {
  for (const g of NAV) for (const it of g.items) if (it.page === page) return !it.perm || can(it.perm);
  return true;
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { route, go, can, t, settings } = useApp();
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} />}
      <aside
        className={cx(
          'fixed inset-y-0 start-0 z-40 flex w-64 flex-col bg-side text-side-ink transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:rtl:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold text-white">{settings.nom}</div>
            <div className="text-xs text-side-muted">Showroom Manager DZ</div>
          </div>
          <button className="rounded-md p-1 text-side-muted hover:text-white lg:hidden" onClick={onClose} aria-label="Fermer le menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {NAV.map((g) => {
            const items = g.items.filter((it) => !it.perm || can(it.perm));
            if (!items.length) return null;
            return (
              <div key={g.group} className="mt-4">
                <div className="px-3 pb-1 text-xs text-side-muted">{t(g.group)}</div>
                {items.map((it) => {
                  const active = route.page === it.page;
                  const Icon = it.icon;
                  return (
                    <button
                      key={it.page}
                      onClick={() => { go(it.page); onClose(); }}
                      aria-current={active ? 'page' : undefined}
                      className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-[13.5px]', active ? 'bg-side-active text-white' : 'text-side-ink hover:bg-white/5')}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {t(it.key)}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOut(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOut]);
}

function GlobalSearch() {
  const { go, t } = useApp();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  const needle = q.trim().toLowerCase();
  const vehicules = useTable<Vehicule>(needle.length >= 2 ? 'vehicules' : null);
  const clients = useTable<Client>(needle.length >= 2 ? 'clients' : null);
  const ventes = useTable<Vente>(needle.length >= 2 ? 'ventes' : null);

  const results = useMemo(() => {
    if (needle.length < 2) return [];
    const has = (s: string) => s.toLowerCase().includes(needle);
    return [
      ...(vehicules ?? []).filter((v) => has(`${v.reference} ${v.vin} ${v.immatriculation} ${v.marque} ${v.modele}`)).slice(0, 5)
        .map((v) => ({ id: v.id, label: `${v.marque} ${v.modele}`, sub: `${v.reference}${v.vin ? ' · ' + v.vin : ''}`, kind: 'Véhicule', go: () => go('vehicules', { open: v.id }) })),
      ...(clients ?? []).filter((c) => has(`${c.nom} ${c.telephone}`)).slice(0, 5)
        .map((c) => ({ id: c.id, label: c.nom, sub: c.telephone, kind: 'Client', go: () => go('clients', { open: c.id }) })),
      ...(ventes ?? []).filter((v) => has(`${v.numero} ${v.vehicule_libelle} ${v.facture_numero ?? ''}`)).slice(0, 5)
        .map((v) => ({ id: v.id, label: v.numero, sub: v.vehicule_libelle, kind: 'Vente', go: () => go('ventes', { open: v.id }) })),
    ];
  }, [needle, vehicules, clients, ventes, go]);

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={t('top.search')}
        aria-label="Recherche globale"
        className="h-9 w-full rounded-lg border border-line bg-surface-2 ps-9 pe-3 placeholder:text-muted focus:border-brand focus:bg-surface focus:outline-none"
      />
      {open && needle.length >= 2 && (
        <div className="absolute inset-x-0 top-11 z-30 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          {results.length === 0 && <div className="px-4 py-3 text-muted">{vehicules ? 'Aucun résultat.' : 'Recherche…'}</div>}
          {results.map((r) => (
            <button key={r.kind + r.id} onClick={() => { r.go(); setOpen(false); setQ(''); }} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start hover:bg-surface-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{r.label}</span>
                <span className="block truncate text-xs text-muted">{r.sub}</span>
              </span>
              <span className="text-xs text-muted">{r.kind}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AlertsMenu() {
  const { go, t, can } = useApp();
  const alerts = useAlerts(can).filter((a) => pageAllowed(a.page, can));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink" aria-label={t('top.alerts')}>
        <Bell className="h-5 w-5" />
        {alerts.length > 0 && <span className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red px-1 text-[10px] font-semibold text-white">{alerts.length}</span>}
      </button>
      {open && (
        <div className="absolute end-0 top-11 z-30 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          <div className="border-b border-line px-4 py-2.5 font-semibold">{t('top.alerts')}</div>
          {alerts.length === 0 && <div className="px-4 py-4 text-muted">{t('top.noAlerts')}</div>}
          {alerts.map((a) => (
            <button key={a.id} onClick={() => { go(a.page, a.params); setOpen(false); }} className="flex w-full items-start gap-2.5 border-b border-line px-4 py-3 text-start last:border-0 hover:bg-surface-2">
              <CircleDot className={cx('mt-0.5 h-4 w-4 shrink-0', a.tone === 'red' ? 'text-red' : a.tone === 'amber' ? 'text-amber' : 'text-blue')} />
              <span className="text-[13px]">{a.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const { user, t, lang, setLang, theme, setTheme, logout } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  const name = user.nom || user.email;
  const initials = name.split(/[^\p{L}]+/u).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-lg p-1 pe-2 hover:bg-surface-2" aria-label="Profil">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-ink">{initials}</span>
        <span className="hidden text-start leading-tight md:block">
          <span className="block max-w-40 truncate text-[13px] font-medium">{name}</span>
          <span className="block text-xs text-muted">{ROLE_LABELS[user.role]}</span>
        </span>
      </button>
      {open && (
        <div className="absolute end-0 top-11 z-30 w-60 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg">
          <div className="truncate px-4 py-2 text-xs text-muted">{user.email}</div>
          <button onClick={() => setLang(lang === 'fr' ? 'ar' : 'fr')} className="flex w-full items-center gap-2.5 px-4 py-2 text-start hover:bg-surface-2">
            <Languages className="h-4 w-4 text-muted" /> {t('top.lang')}
          </button>
          <label className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2 hover:bg-surface-2">
            <Moon className="h-4 w-4 text-muted" />
            <span className="flex-1">{t('top.theme')}</span>
            <input type="checkbox" checked={theme === 'dark'} onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')} className="accent-[var(--brand)]" />
          </label>
          <div className="my-1 border-t border-line" />
          <button onClick={logout} className="flex w-full items-center gap-2.5 px-4 py-2 text-start text-red hover:bg-surface-2">
            <LogOut className="h-4 w-4" /> {t('top.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

function CashChip() {
  const { go, t, can } = useApp();
  const cash = useOpenCash(can('caisse.voir'));
  if (!can('caisse.voir') || !cash) return null;
  return (
    <button onClick={() => go('caisse')} className={cx('hidden items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs sm:flex', cash.session ? 'border-green/40 text-green' : 'border-line text-muted')}>
      <span className={cx('h-2 w-2 rounded-full', cash.session ? 'bg-green' : 'bg-muted')} />
      {cash.session ? <>{t('top.cashOpen')} · <span className="tabular-nums">{da(cash.solde)}</span></> : t('top.cashClosed')}
    </button>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { go, can, t } = useApp();
  const [menu, setMenu] = useState(false);
  const loadError = useLoadError();
  const today = useMemo(() => date(Date.now()), []);
  return (
    <div className="flex min-h-full">
      <Sidebar open={menu} onClose={() => setMenu(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-3 backdrop-blur sm:px-5 no-print">
          <button className="rounded-md p-1.5 text-muted hover:bg-surface-2 lg:hidden" onClick={() => setMenu(true)} aria-label="Ouvrir le menu">
            <Menu className="h-5 w-5" />
          </button>
          <GlobalSearch />
          <div className="ms-auto flex items-center gap-1.5 sm:gap-3">
            <span className="hidden text-[13px] text-muted xl:inline">{today}</span>
            <CashChip />
            {can('ventes.creer') && (
              <span className="hidden sm:block">
                <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => go('ventes', { nouvelle: '1' })}>{t('top.newSale')}</Button>
              </span>
            )}
            <AlertsMenu />
            <ProfileMenu />
          </div>
        </header>
        {BACKEND_KIND === 'demo' && <div className="border-b border-amber/30 bg-amber-soft px-5 py-2 text-[13px] text-amber no-print">{t('demo.banner')}</div>}
        {loadError && (
          <div role="alert" className="flex items-center gap-2 border-b border-red/30 bg-red-soft px-5 py-2 text-[13px] text-red no-print">
            <WifiOff className="h-4 w-4" /> {t('load.error')} : {loadError} Nouvel essai automatique dans quelques secondes.
          </div>
        )}
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
