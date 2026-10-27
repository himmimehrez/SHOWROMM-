/**
 * Indicateurs. Définitions (aussi affichées dans Rapports) :
 *  - Chiffre d'affaires net : total HT (après remise) des ventes non annulées conclues sur la période.
 *    La TVA collectée n'est pas un revenu : elle est suivie à part.
 *  - Encaissements : argent réellement reçu sur la période (espèces, virements, cartes, chèques encaissés,
 *    traites payées), moins les remboursements. Chèques en attente et traites en portefeuille non compris.
 *  - Coût de revient : prix d'achat + frais rattachés au véhicule (figé au moment de la vente).
 *  - Marge brute estimée : CA HT − coût de revient des véhicules vendus.
 *  - Charges : dépenses non annulées NON rattachées à un véhicule (les autres sont déjà dans le coût de revient).
 *  - Résultat estimé : marge brute − charges. Indicatif, hors impôts et amortissements.
 */
import type { Achat, Depense, Paiement, PaiementFournisseur, Vehicule, Vente, VenteSolde } from './types';
import { dayKey, toTime } from './format';

export interface Dataset {
  ventes: Vente[];
  soldes: Map<string, VenteSolde>;
  paiements: Paiement[];
  vehicules: Vehicule[];
  couts: Map<string, number>;       // prix d'achat par véhicule (vide sans droit)
  venteCouts: Map<string, number>;  // coût de revient figé par vente (vide sans droit)
  depenses: Depense[];
  achats: Achat[];
  paiementsFournisseurs: PaiementFournisseur[];
}

export interface Period { from: number; to: number } // [from, to[

const inP = (t: number | string | null, p: Period) => {
  const x = toTime(t);
  return x >= p.from && x < p.to;
};

const RECU = new Set(['confirme', 'encaisse', 'payee']);

/** Date à laquelle l'argent est effectivement reçu : confirmation de la banque pour un chèque, paiement pour une traite */
function dateReception(p: Paiement) {
  return p.mode === 'cheque' || p.mode === 'cheque_certifie' || p.mode === 'traite' ? p.statut_date ?? p.date : p.date;
}

export function fraisParVehicule(depenses: Depense[]) {
  const m = new Map<string, number>();
  for (const d of depenses) if (d.vehicule_id && !d.annulee) m.set(d.vehicule_id, (m.get(d.vehicule_id) ?? 0) + d.montant);
  return m;
}

export function computeKpis(ds: Dataset, p: Period) {
  const frais = fraisParVehicule(ds.depenses);
  const ventes = ds.ventes.filter((v) => v.statut !== 'annulee' && inP(v.date, p));
  const ca = ventes.reduce((s, v) => s + v.montant_ht, 0);
  const tva = ventes.reduce((s, v) => s + v.montant_tva, 0);
  const ttc = ventes.reduce((s, v) => s + v.montant_ttc, 0);
  const remises = ventes.reduce((s, v) => s + v.remise_ht, 0);
  const cout = ventes.reduce((s, v) => s + (ds.venteCouts.get(v.id) ?? 0), 0);
  const marge = ca - cout;

  let encaisse = 0;
  let encEspeces = 0;
  let timbre = 0;
  for (const pm of ds.paiements) {
    if (!inP(dateReception(pm), p)) continue;
    if (pm.sens === 'encaissement' && RECU.has(pm.statut)) {
      encaisse += pm.montant;
      if (pm.mode === 'especes') { encEspeces += pm.montant; timbre += pm.droit_timbre; }
    } else if (pm.sens === 'remboursement' && pm.statut === 'confirme') {
      encaisse -= pm.montant;
      if (pm.mode === 'especes') encEspeces -= pm.montant;
    }
  }
  const chequesAttente = ds.paiements.filter((x) => x.statut === 'en_attente').reduce((s, x) => s + x.montant, 0);
  const traitesPortefeuille = ds.paiements.filter((x) => x.statut === 'en_portefeuille').reduce((s, x) => s + x.montant, 0);

  const deps = ds.depenses.filter((d) => !d.annulee && inP(d.date, p));
  const charges = deps.filter((d) => !d.vehicule_id).reduce((s, d) => s + d.montant, 0);
  const fraisVehicules = deps.filter((d) => d.vehicule_id).reduce((s, d) => s + d.montant, 0);

  const enStock = ds.vehicules.filter((v) => ['disponible', 'reserve', 'bloque', 'en_transit'].includes(v.statut));
  const valeurStock = enStock.reduce((s, v) => s + (ds.couts.get(v.id) ?? 0) + (frais.get(v.id) ?? 0), 0);
  const valeurStockVente = enStock.reduce((s, v) => s + v.prix_vente_ht, 0);
  const actives = ds.ventes.filter((v) => v.statut !== 'annulee');
  const creances = actives.reduce((s, v) => s + Math.max(0, v.montant_ttc - (ds.soldes.get(v.id)?.encaisse ?? 0)), 0);
  const aLivrer = ds.ventes.filter((v) => v.statut === 'confirmee' && v.montant_ttc - (ds.soldes.get(v.id)?.encaisse ?? 0) <= 0).length;
  const payeAchat = new Map<string, number>();
  for (const pf of ds.paiementsFournisseurs) payeAchat.set(pf.achat_id, (payeAchat.get(pf.achat_id) ?? 0) + pf.montant);
  const dettes = ds.achats.filter((a) => a.statut !== 'annule').reduce((s, a) => s + Math.max(0, a.montant_total - (payeAchat.get(a.id) ?? 0)), 0);

  return {
    nbVentes: ventes.length, ca, tva, ttc, remises, cout, marge, tauxMarge: ca > 0 ? marge / ca : 0,
    encaisse, encEspeces, timbre, chequesAttente, traitesPortefeuille, charges, fraisVehicules, resultat: marge - charges,
    nbStock: enStock.length, nbDisponibles: ds.vehicules.filter((v) => v.statut === 'disponible').length,
    valeurStock, valeurStockVente, creances, dettes, aLivrer,
    ventesSansCout: ventes.filter((v) => ds.venteCouts.size > 0 && (ds.venteCouts.get(v.id) ?? 0) <= 0).length,
  };
}

/** Série journalière (fuseau d'Alger) : CA HT et encaissements */
export function seriesParJour(ds: Dataset, p: Period) {
  const days: { key: string; label: string; ca: number; encaisse: number }[] = [];
  for (let t = p.from; t < p.to; t += 86400000) {
    const key = dayKey(t);
    days.push({ key, label: `${key.slice(8, 10)}/${key.slice(5, 7)}`, ca: 0, encaisse: 0 });
  }
  const idx = new Map(days.map((d, i) => [d.key, i]));
  for (const v of ds.ventes) {
    if (v.statut === 'annulee' || !inP(v.date, p)) continue;
    const i = idx.get(dayKey(toTime(v.date)));
    if (i !== undefined) days[i].ca += v.montant_ht;
  }
  for (const pm of ds.paiements) {
    const d = dateReception(pm);
    if (!inP(d, p)) continue;
    const i = idx.get(dayKey(toTime(d)));
    if (i === undefined) continue;
    if (pm.sens === 'encaissement' && RECU.has(pm.statut)) days[i].encaisse += pm.montant;
    if (pm.sens === 'remboursement' && pm.statut === 'confirme') days[i].encaisse -= pm.montant;
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
