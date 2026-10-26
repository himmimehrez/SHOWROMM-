import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from './db';
import { montantPaye, soldeTheorique } from './services';
import type { Depot, Client, Fournisseur, Vehicule } from './types';

export function useDepots() {
  const depots = useLiveQuery(() => db.depots.toArray(), []);
  const byId = useMemo(() => new Map((depots ?? []).map((d) => [d.id, d] as [string, Depot])), [depots]);
  return { depots: depots ?? [], depotById: byId };
}

export function useClientsMap() {
  const clients = useLiveQuery(() => db.clients.toArray(), []);
  return useMemo(() => new Map((clients ?? []).map((c) => [c.id, c] as [string, Client])), [clients]);
}

export function useFournisseursMap() {
  const list = useLiveQuery(() => db.fournisseurs.toArray(), []);
  return useMemo(() => new Map((list ?? []).map((c) => [c.id, c] as [string, Fournisseur])), [list]);
}

export function useVehiculesMap() {
  const list = useLiveQuery(() => db.vehicules.toArray(), []);
  return useMemo(() => new Map((list ?? []).map((v) => [v.id, v] as [string, Vehicule])), [list]);
}

/** Session de caisse ouverte et son solde théorique */
export function useOpenCash() {
  return useLiveQuery(async () => {
    const s = await db.caisse_sessions.where('statut').equals('ouverte').first();
    if (!s) return { session: null, solde: 0 };
    const m = await db.caisse_mouvements.where('session_id').equals(s.id).toArray();
    return { session: s, solde: soldeTheorique(s, m) };
  }, []);
}

export interface Alert {
  id: string;
  tone: 'amber' | 'red' | 'blue';
  text: string;
  page: 'ventes' | 'vehicules' | 'caisse' | 'achats' | 'clients';
  params?: Record<string, string>;
}

export const STOCK_AGE_ALERT_DAYS = 90;

export function useAlerts(): Alert[] {
  return useLiveQuery(async () => {
    const alerts: Alert[] = [];
    const [ventes, enc, vehicules, session, achats] = await Promise.all([
      db.ventes.where('statut').equals('confirmee').toArray(),
      db.encaissements.toArray(),
      db.vehicules.where('statut').equals('disponible').toArray(),
      db.caisse_sessions.where('statut').equals('ouverte').first(),
      db.achats.where('statut').anyOf('commande', 'partiel').toArray(),
    ]);
    const aLivrer = ventes.filter((v) => v.total_net - montantPaye(v.id, enc) <= 0);
    if (aLivrer.length) alerts.push({ id: 'livrer', tone: 'blue', text: `${aLivrer.length} vente(s) soldée(s) prête(s) à livrer`, page: 'ventes', params: { filtre: 'a_livrer' } });
    const impayes = ventes.filter((v) => v.total_net - montantPaye(v.id, enc) > 0);
    if (impayes.length) alerts.push({ id: 'impayes', tone: 'amber', text: `${impayes.length} vente(s) avec un reste à payer`, page: 'clients', params: { onglet: 'creances' } });
    const vieux = vehicules.filter((v) => Date.now() - v.created_at > STOCK_AGE_ALERT_DAYS * 86400000);
    if (vieux.length) alerts.push({ id: 'stock', tone: 'amber', text: `${vieux.length} véhicule(s) en stock depuis plus de ${STOCK_AGE_ALERT_DAYS} jours`, page: 'vehicules', params: { filtre: 'anciens' } });
    const sansPrix = vehicules.filter((v) => v.prix_vente <= 0);
    if (sansPrix.length) alerts.push({ id: 'prix', tone: 'red', text: `${sansPrix.length} véhicule(s) disponible(s) sans prix de vente`, page: 'vehicules', params: { filtre: 'sans_prix' } });
    if (session && Date.now() - session.ouverture > 18 * 3600000) alerts.push({ id: 'caisse', tone: 'red', text: `Caisse ${session.numero} ouverte depuis plus de 18 h : pensez à la clôturer`, page: 'caisse' });
    if (achats.length) alerts.push({ id: 'achats', tone: 'blue', text: `${achats.length} commande(s) fournisseur en attente de réception`, page: 'achats' });
    return alerts;
  }, []) ?? [];
}

/** Toutes les données utiles aux indicateurs, réactives */
export function useDataset(): import('./stats').Dataset | undefined {
  return useLiveQuery(async () => {
    const [ventes, encaissements, vehicules, depenses, achats, paiementsFournisseurs] = await Promise.all([
      db.ventes.toArray(), db.encaissements.toArray(), db.vehicules.toArray(), db.depenses.toArray(),
      db.achats.toArray(), db.paiements_fournisseurs.toArray(),
    ]);
    return { ventes, encaissements, vehicules, depenses, achats, paiementsFournisseurs };
  }, []);
}
