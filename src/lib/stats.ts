/**
 * Indicateurs. Définitions (aussi affichées dans Rapports) :
 *  - Chiffre d'affaires net : total net (après remise) des ventes non annulées conclues sur la période.
 *  - Encaissements nets : paiements reçus − remboursements versés, à leur date.
 *  - Coût de revient d'un véhicule : prix d'achat + frais annexes non annulés qui lui sont rattachés.
 *  - Marge brute estimée : CA net − coût de revient des véhicules vendus.
 *  - Charges : dépenses non annulées NON rattachées à un véhicule (les autres sont déjà dans le coût de revient).
 *  - Résultat estimé : marge brute − charges. Indicatif, hors fiscalité et amortissements.
 */
import type { Depense, Encaissement, Vehicule, Vente, Achat, PaiementFournisseur } from './types';
import { dayKey } from './format';

export interface Dataset {
  ventes: Vente[];
  encaissements: Encaissement[];
  vehicules: Vehicule[];
  depenses: Depense[];
  achats: Achat[];
  paiementsFournisseurs: PaiementFournisseur[];
}

export interface Period { from: number; to: number } // [from, to[

const inP = (t: number, p: Period) => t >= p.from && t < p.to;

export function fraisParVehicule(depenses: Depense[]) {
  const m = new Map<string, number>();
  for (const d of depenses) if (d.vehicule_id && !d.annulee) m.set(d.vehicule_id, (m.get(d.vehicule_id) ?? 0) + d.montant);
  return m;
}

export function coutVente(v: Vente, vehicules: Map<string, Vehicule>, frais: Map<string, number>) {
  const veh = vehicules.get(v.vehicule_id);
  return veh ? veh.prix_achat + (frais.get(veh.id) ?? 0) : v.cout_revient;
}

export function computeKpis(ds: Dataset, p: Period) {
  const vehMap = new Map(ds.vehicules.map((v) => [v.id, v]));
  const frais = fraisParVehicule(ds.depenses);
  const ventes = ds.ventes.filter((v) => v.statut !== 'annulee' && inP(v.date, p));
  const ca = ventes.reduce((s, v) => s + v.total_net, 0);
  const remises = ventes.reduce((s, v) => s + v.remise, 0);
  const cout = ventes.reduce((s, v) => s + coutVente(v, vehMap, frais), 0);
  const marge = ca - cout;
  const enc = ds.encaissements.filter((e) => inP(e.date, p));
  const encaisse = enc.reduce((s, e) => s + (e.type === 'paiement' ? e.montant : -e.montant), 0);
  const encEspeces = enc.filter((e) => e.mode === 'especes').reduce((s, e) => s + (e.type === 'paiement' ? e.montant : -e.montant), 0);
  const deps = ds.depenses.filter((d) => !d.annulee && inP(d.date, p));
  const charges = deps.filter((d) => !d.vehicule_id).reduce((s, d) => s + d.montant, 0);
  const fraisVehicules = deps.filter((d) => d.vehicule_id).reduce((s, d) => s + d.montant, 0);

  // Instantanés (indépendants de la période)
  const enStock = ds.vehicules.filter((v) => v.statut === 'disponible' || v.statut === 'reserve' || v.statut === 'bloque');
  const valeurStock = enStock.reduce((s, v) => s + v.prix_achat + (frais.get(v.id) ?? 0), 0);
  const valeurStockVente = enStock.reduce((s, v) => s + v.prix_vente, 0);
  const payeParVente = new Map<string, number>();
  for (const e of ds.encaissements) payeParVente.set(e.vente_id, (payeParVente.get(e.vente_id) ?? 0) + (e.type === 'paiement' ? e.montant : -e.montant));
  const creances = ds.ventes.filter((v) => v.statut !== 'annulee').reduce((s, v) => s + Math.max(0, v.total_net - (payeParVente.get(v.id) ?? 0)), 0);
  const payeParAchat = new Map<string, number>();
  for (const pf of ds.paiementsFournisseurs) payeParAchat.set(pf.achat_id, (payeParAchat.get(pf.achat_id) ?? 0) + pf.montant);
  const dettes = ds.achats.filter((a) => a.statut !== 'annule').reduce((s, a) => s + Math.max(0, a.montant_total - (payeParAchat.get(a.id) ?? 0)), 0);
  const aLivrer = ds.ventes.filter((v) => v.statut === 'confirmee' && v.total_net - (payeParVente.get(v.id) ?? 0) <= 0).length;

  return {
    nbVentes: ventes.length, ca, remises, cout, marge, tauxMarge: ca > 0 ? marge / ca : 0,
    encaisse, encEspeces, charges, fraisVehicules, resultat: marge - charges,
    nbStock: enStock.length, nbDisponibles: ds.vehicules.filter((v) => v.statut === 'disponible').length,
    valeurStock, valeurStockVente, creances, dettes, aLivrer,
    ventesSansCout: ventes.filter((v) => coutVente(v, vehMap, frais) <= 0).length,
  };
}

/** Série journalière (fuseau d'Alger) : CA et nombre de ventes */
export function seriesParJour(ds: Dataset, p: Period) {
  const days: { key: string; label: string; ca: number; ventes: number; encaisse: number }[] = [];
  for (let t = p.from; t < p.to; t += 86400000) {
    const key = dayKey(t);
    days.push({ key, label: `${key.slice(8, 10)}/${key.slice(5, 7)}`, ca: 0, ventes: 0, encaisse: 0 });
  }
  const idx = new Map(days.map((d, i) => [d.key, i]));
  for (const v of ds.ventes) {
    if (v.statut === 'annulee' || !inP(v.date, p)) continue;
    const i = idx.get(dayKey(v.date));
    if (i !== undefined) { days[i].ca += v.total_net; days[i].ventes += 1; }
  }
  for (const e of ds.encaissements) {
    if (!inP(e.date, p)) continue;
    const i = idx.get(dayKey(e.date));
    if (i !== undefined) days[i].encaisse += e.type === 'paiement' ? e.montant : -e.montant;
  }
  return days;
}

export function groupBy<T>(items: T[], key: (t: T) => string, value: (t: T) => number) {
  const m = new Map<string, { label: string; total: number; count: number }>();
  for (const it of items) {
    const k = key(it);
    const g = m.get(k) ?? { label: k, total: 0, count: 0 };
    g.total += value(it);
    g.count += 1;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}
