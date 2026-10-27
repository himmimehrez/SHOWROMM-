import { useMemo } from 'react';
import { getBackend, useData, useTable } from './data';
import type {
  Achat, CaisseMouvement, CaisseSession, Client, Depense, Depot, Fournisseur, Paiement, Vehicule, VehiculeCout, Vente, VenteCout, VenteSolde,
} from './types';

export function byId<T extends { id: string }>(rows: T[] | undefined) {
  return new Map((rows ?? []).map((r) => [r.id, r] as [string, T]));
}

export function useDepots() {
  const depots = useTable<Depot>('depots', { order: { column: 'code' } });
  const depotById = useMemo(() => byId(depots), [depots]);
  return { depots: depots ?? [], depotById };
}

export function useClientsMap() {
  const rows = useTable<Client>('clients');
  return useMemo(() => byId(rows), [rows]);
}

export function useFournisseursMap() {
  const rows = useTable<Fournisseur>('fournisseurs');
  return useMemo(() => byId(rows), [rows]);
}

export function useVehiculesMap() {
  const rows = useTable<Vehicule>('vehicules');
  return useMemo(() => byId(rows), [rows]);
}

/** Prix d'achat par véhicule (vide si l'utilisateur n'a pas accès aux coûts) */
export function useCouts() {
  const rows = useTable<VehiculeCout>('vehicule_couts');
  return useMemo(() => new Map((rows ?? []).map((r) => [r.vehicule_id, r.prix_achat])), [rows]);
}

export function useVenteCouts() {
  const rows = useTable<VenteCout>('vente_couts');
  return useMemo(() => new Map((rows ?? []).map((r) => [r.vente_id, r.cout_revient])), [rows]);
}

export function useSoldes() {
  const rows = useTable<VenteSolde>('v_ventes_soldes');
  return useMemo(() => new Map((rows ?? []).map((r) => [r.vente_id, r])), [rows]);
}

/** Reste à encaisser (TTC − encaissé confirmé) */
export function resteAPayer(v: Vente, s?: VenteSolde) {
  if (v.statut === 'annulee') return 0;
  return v.montant_ttc - (s?.encaisse ?? 0);
}

/** Frais annexes (dépenses non annulées) par véhicule */
export function useFraisParVehicule(enabled = true) {
  const rows = useTable<Depense>(enabled ? 'depenses' : null);
  return useMemo(() => {
    const m = new Map<string, number>();
    for (const d of rows ?? []) if (d.vehicule_id && !d.annulee) m.set(d.vehicule_id, (m.get(d.vehicule_id) ?? 0) + d.montant);
    return m;
  }, [rows]);
}

/** Session de caisse ouverte et son solde théorique */
export function useOpenCash(enabled = true) {
  return useData(enabled ? 'caisse-ouverte' : null, async () => {
    const b = getBackend();
    const [session] = await b.select<CaisseSession>('caisse_sessions', { eq: { statut: 'ouverte' } });
    if (!session) return { session: null as CaisseSession | null, solde: 0, mouvements: [] as CaisseMouvement[] };
    const mouvements = await b.select<CaisseMouvement>('caisse_mouvements', { eq: { session_id: session.id }, order: { column: 'date', ascending: false } });
    const solde = mouvements.reduce((s, m) => s + (m.sens === 'in' ? m.montant : -m.montant), session.fonds_initial);
    return { session, solde, mouvements };
  });
}

export interface Alert {
  id: string;
  tone: 'amber' | 'red' | 'blue';
  text: string;
  page: 'ventes' | 'vehicules' | 'caisse' | 'achats' | 'clients' | 'paiements';
  params?: Record<string, string>;
}

export const STOCK_AGE_ALERT_DAYS = 90;

export function useAlerts(can: (p: string) => boolean): Alert[] {
  const ventes = useTable<Vente>('ventes', { eq: { statut: 'confirmee' } });
  const soldes = useSoldes();
  const vehicules = useTable<Vehicule>('vehicules', { eq: { statut: 'disponible' } });
  const paiements = useTable<Paiement>('paiements');
  const cash = useOpenCash(can('caisse.voir'));
  const achats = useTable<Achat>(can('achats.voir') ? 'achats' : null);
  return useMemo(() => {
    const out: Alert[] = [];
    const today = new Date().toISOString().slice(0, 10);
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const v = ventes ?? [];
    const aLivrer = v.filter((x) => resteAPayer(x, soldes.get(x.id)) <= 0);
    if (aLivrer.length) out.push({ id: 'livrer', tone: 'blue', text: `${aLivrer.length} vente(s) soldée(s) prête(s) à livrer`, page: 'ventes', params: { filtre: 'a_livrer' } });
    const cheques = (paiements ?? []).filter((p) => p.statut === 'en_attente');
    if (cheques.length) out.push({ id: 'cheques', tone: 'amber', text: `${cheques.length} chèque(s) en attente de confirmation de la banque`, page: 'paiements', params: { filtre: 'en_attente' } });
    const traitesEchues = (paiements ?? []).filter((p) => p.statut === 'en_portefeuille' && p.echeance && p.echeance <= today);
    if (traitesEchues.length) out.push({ id: 'traites-echues', tone: 'red', text: `${traitesEchues.length} traite(s) arrivée(s) à échéance à vérifier`, page: 'paiements', params: { filtre: 'traites_echues' } });
    const traitesProches = (paiements ?? []).filter((p) => p.statut === 'en_portefeuille' && p.echeance && p.echeance > today && p.echeance <= in7);
    if (traitesProches.length) out.push({ id: 'traites-proches', tone: 'amber', text: `${traitesProches.length} traite(s) à échéance dans les 7 jours`, page: 'paiements', params: { filtre: 'portefeuille' } });
    const impayes = v.filter((x) => resteAPayer(x, soldes.get(x.id)) > 0);
    if (impayes.length) out.push({ id: 'impayes', tone: 'amber', text: `${impayes.length} vente(s) avec un reste à encaisser`, page: 'clients', params: { onglet: 'creances' } });
    const vieux = (vehicules ?? []).filter((x) => Date.now() - Date.parse(x.created_at) > STOCK_AGE_ALERT_DAYS * 86400000);
    if (vieux.length) out.push({ id: 'stock', tone: 'amber', text: `${vieux.length} véhicule(s) en stock depuis plus de ${STOCK_AGE_ALERT_DAYS} jours`, page: 'vehicules', params: { filtre: 'anciens' } });
    const sansPrix = (vehicules ?? []).filter((x) => x.prix_vente_ht <= 0);
    if (sansPrix.length) out.push({ id: 'prix', tone: 'red', text: `${sansPrix.length} véhicule(s) disponible(s) sans prix de vente`, page: 'vehicules', params: { filtre: 'sans_prix' } });
    if (cash?.session && Date.now() - Date.parse(cash.session.ouverture) > 18 * 3600000) {
      out.push({ id: 'caisse', tone: 'red', text: `Caisse ${cash.session.numero} ouverte depuis plus de 18 h : pensez à la clôturer`, page: 'caisse' });
    }
    const attente = (achats ?? []).filter((a) => a.statut === 'commande' || a.statut === 'partiel');
    if (attente.length) out.push({ id: 'achats', tone: 'blue', text: `${attente.length} commande(s) fournisseur en attente de réception`, page: 'achats' });
    return out;
  }, [ventes, soldes, vehicules, paiements, cash, achats]);
}

/** Toutes les données utiles aux indicateurs (chaque table est filtrée par les droits de l'utilisateur) */
export function useDataset(can: (p: string) => boolean): import('./stats').Dataset | undefined {
  const ventes = useTable<Vente>('ventes');
  const soldes = useSoldes();
  const paiements = useTable<Paiement>('paiements');
  const vehicules = useTable<Vehicule>('vehicules');
  const couts = useCouts();
  const venteCouts = useVenteCouts();
  const depenses = useTable<Depense>(can('depenses.voir') ? 'depenses' : null);
  const achats = useTable<Achat>(can('achats.voir') ? 'achats' : null);
  const pf = useTable<import('./types').PaiementFournisseur>(can('achats.voir') ? 'paiements_fournisseurs' : null);
  return useMemo(() => {
    if (!ventes || !paiements || !vehicules) return undefined;
    return {
      ventes, soldes, paiements, vehicules, couts, venteCouts,
      depenses: depenses ?? [], achats: achats ?? [], paiementsFournisseurs: pf ?? [],
    };
  }, [ventes, soldes, paiements, vehicules, couts, venteCouts, depenses, achats, pf]);
}
