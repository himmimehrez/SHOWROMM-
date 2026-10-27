/**
 * Aperçu instantané des calculs dans les formulaires. Ce sont les mêmes formules que les fonctions
 * serveur calcul_prix et calcul_droit_timbre. Le montant enregistré est toujours celui calculé par le serveur.
 */
import type { ModePrix, ShopSettings } from './types';

export interface Prix { ht: number; tva: number; ttc: number; taux: number | null; erreur?: string }

export function calculPrix(mode: ModePrix, montant: number, montantTtc: number, taux: number, remise: number): Prix {
  const r = remise || 0;
  if (mode === 'taux_ht') {
    const ht = montant - r;
    if (ht < 0) return { ht: 0, tva: 0, ttc: 0, taux, erreur: 'La remise dépasse le prix.' };
    const tva = Math.round((ht * taux) / 100);
    return { ht, tva, ttc: ht + tva, taux };
  }
  if (mode === 'taux_ttc') {
    const ht = Math.round(montant / (1 + taux / 100)) - r;
    if (ht < 0) return { ht: 0, tva: 0, ttc: 0, taux, erreur: 'La remise dépasse le prix.' };
    const tva = Math.round((ht * taux) / 100);
    return { ht, tva, ttc: ht + tva, taux };
  }
  if (mode === 'montants') {
    if (montantTtc < montant) return { ht: montant, tva: 0, ttc: montantTtc, taux: null, erreur: 'Le TTC ne peut pas être inférieur au HT.' };
    return { ht: montant, tva: montantTtc - montant, ttc: montantTtc, taux: null };
  }
  return { ht: montant, tva: 0, ttc: montant, taux: null };
}

export function tauxEffectif(p: Prix) {
  return p.ht > 0 ? (p.tva / p.ht) * 100 : 0;
}

export function droitTimbre(montant: number, s: ShopSettings['timbre']): number {
  if (!montant || montant <= (s?.exonere_jusqua ?? 300)) return 0;
  const tranche = (s?.tranches ?? []).find((t) => t.jusqua === null || montant <= t.jusqua);
  const droit = Math.ceil(montant / 100) * (tranche?.par_100 ?? 0);
  return Math.max(Math.round(droit), s?.minimum ?? 0);
}

export const MODE_PRIX_LABELS: Record<ModePrix, { titre: string; aide: string }> = {
  taux_ht: { titre: 'Prix HT + taux', aide: 'Vous saisissez le prix HT et le taux : la TVA et le TTC sont calculés.' },
  taux_ttc: { titre: 'Prix TTC + taux', aide: 'Vous saisissez le prix TTC et le taux : le HT et la TVA sont calculés.' },
  montants: { titre: 'HT et TTC saisis', aide: 'Vous saisissez les deux montants : la TVA est la différence (ex. TVA sur marge d’un véhicule d’occasion).' },
  direct: { titre: 'Prix direct, sans TVA', aide: 'Vous saisissez le montant final déjà calculé : aucune TVA n’est détaillée sur la facture.' },
};
