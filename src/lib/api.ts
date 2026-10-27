/**
 * Opérations métier : chaque fonction appelle une fonction serveur (supabase/migrations/…_fonctions.sql).
 * Les contrôles (droits, dépôt, montants, statuts) sont faits par la base ; ici on ne fait que transmettre.
 * Après chaque opération réussie, les écrans se rafraîchissent.
 */
import { getBackend, invalidate } from './data';
import type {
  Achat, CaisseSession, Client, Depense, Depot, Fournisseur, ModePaiement, ModePrix, Paiement, ShopSettings, Vehicule, Vente, Role,
} from './types';

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  try {
    return await getBackend().rpc<T>(fn, args);
  } finally {
    invalidate();
  }
}

const row = <T>(r: unknown) => (Array.isArray(r) ? r[0] : r) as T;

export type VehiculeInput = Partial<Omit<Vehicule, 'id' | 'reference' | 'statut' | 'created_at' | 'updated_at'>> & { prix_achat?: number };

export const api = {
  // Paramètres et administration
  settingsSave: (data: Partial<ShopSettings>) => call<void>('settings_save', { p_data: data }),
  depotSave: (d: Partial<Depot> & { code: string; nom: string }) =>
    call<Depot>('depot_save', { p_id: d.id ?? null, p_code: d.code, p_nom: d.nom, p_adresse: d.adresse ?? '', p_responsable: d.responsable ?? '', p_actif: d.actif ?? true }).then(row<Depot>),
  profileUpdate: (id: string, p: { nom: string; role: Role; actif: boolean; tous_depots: boolean; depots: string[] }) =>
    call<void>('profile_update', { p_id: id, p_nom: p.nom, p_role: p.role, p_actif: p.actif, p_tous_depots: p.tous_depots, p_depots: p.depots }),

  // Véhicules
  vehiculeCreate: (p: VehiculeInput) => call<Vehicule>('vehicule_create', { p }).then(row<Vehicule>),
  vehiculeUpdate: (id: string, p: VehiculeInput) => call<Vehicule>('vehicule_update', { p_id: id, p }).then(row<Vehicule>),
  vehiculeTransferer: (id: string, depot: string, motif: string) => call<void>('vehicule_transferer', { p_id: id, p_depot: depot, p_motif: motif }),
  vehiculeBloquer: (id: string, bloquer: boolean, motif: string) => call<void>('vehicule_bloquer', { p_id: id, p_bloquer: bloquer, p_motif: motif }),

  // Clients
  clientSave: (id: string | null, p: Partial<Client>) => call<Client>('client_save', { p_id: id, p }).then(row<Client>),
  interactionAdd: (client: string, type: string, resume: string, prochaine: string) =>
    call<void>('interaction_add', { p_client: client, p_type: type, p_resume: resume, p_prochaine_action: prochaine }),

  // Ventes et paiements
  venteCreate: (a: { client: string; vehicule: string; mode: ModePrix; montant: number; montantTtc?: number | null; taux?: number | null; remise?: number; notes?: string }) =>
    call<Vente>('vente_create', {
      p_client: a.client, p_vehicule: a.vehicule, p_mode_prix: a.mode, p_montant: a.montant, p_montant_ttc: a.montantTtc ?? null,
      p_taux: a.taux ?? null, p_remise: a.remise ?? 0, p_notes: a.notes ?? '',
    }).then(row<Vente>),
  paiementAjouter: (a: { vente: string; mode: ModePaiement; montant: number; reference?: string; banque?: string; tireur?: string; dateEmission?: string | null; echeance?: string | null }) =>
    call<Paiement>('paiement_ajouter', {
      p_vente: a.vente, p_mode: a.mode, p_montant: a.montant, p_reference: a.reference ?? '', p_banque: a.banque ?? '',
      p_tireur: a.tireur ?? '', p_date_emission: a.dateEmission || null, p_echeance: a.echeance || null,
    }).then(row<Paiement>),
  paiementStatut: (id: string, statut: string, motif = '') => call<void>('paiement_statut', { p_id: id, p_statut: statut, p_motif: motif }),
  paiementRembourser: (vente: string, montant: number, mode: string, motif: string, reference = '') =>
    call<Paiement>('paiement_rembourser', { p_vente: vente, p_montant: montant, p_mode: mode, p_motif: motif, p_reference: reference }).then(row<Paiement>),
  venteLivrer: (vente: string, accordTraite = false) => call<string>('vente_livrer', { p_vente: vente, p_accord_traite: accordTraite }),
  venteAnnuler: (vente: string, motif: string) => call<void>('vente_annuler', { p_vente: vente, p_motif: motif }),
  venteFacturer: (vente: string) => call<string>('vente_facturer', { p_vente: vente }),

  // Caisse
  caisseOuvrir: (fonds: number) => call<CaisseSession>('caisse_ouvrir', { p_fonds: fonds }).then(row<CaisseSession>),
  caisseApportRetrait: (type: 'apport' | 'retrait', montant: number, motif: string) =>
    call<void>('caisse_apport_retrait', { p_type: type, p_montant: montant, p_motif: motif }),
  caisseCloturer: (compte: number, notes: string) =>
    call<unknown>('caisse_cloturer', { p_compte: compte, p_notes: notes }).then(row<{ theorique: number; compte: number; ecart: number }>),

  // Dépenses
  depenseCreer: (d: { categorie: string; libelle: string; montant: number; date: string; mode: string; beneficiaire?: string; vehicule?: string | null }) =>
    call<Depense>('depense_creer', {
      p_categorie: d.categorie, p_libelle: d.libelle, p_montant: d.montant, p_date: d.date, p_mode: d.mode,
      p_beneficiaire: d.beneficiaire ?? '', p_vehicule: d.vehicule || null,
    }).then(row<Depense>),
  depenseAnnuler: (id: string, motif: string) => call<void>('depense_annuler', { p_id: id, p_motif: motif }),

  // Fournisseurs et achats
  fournisseurSave: (id: string | null, p: Partial<Fournisseur>) => call<Fournisseur>('fournisseur_save', { p_id: id, p }).then(row<Fournisseur>),
  achatCreer: (fournisseur: string, lignes: { marque: string; modele: string; finition: string; annee: number; couleur: string; vin: string; prix_achat: number }[], notes: string) =>
    call<Achat>('achat_creer', { p_fournisseur: fournisseur, p_lignes: lignes, p_notes: notes }).then(row<Achat>),
  achatReceptionner: (ligne: string, p: { depot_id: string; vin: string; prix_vente_ht: number; kilometrage: number; etat: string; carburant: string; boite: string; demo?: boolean }) =>
    call<Vehicule>('achat_receptionner', { p_ligne: ligne, p }).then(row<Vehicule>),
  achatAnnuler: (achat: string, motif: string) => call<void>('achat_annuler', { p_achat: achat, p_motif: motif }),
  fournisseurPayer: (achat: string, montant: number, mode: string, reference: string) =>
    call<void>('fournisseur_payer', { p_achat: achat, p_montant: montant, p_mode: mode, p_reference: reference }),
};

/** Calculs sans écriture (aperçu dans les formulaires) */
export const calc = {
  prix: async (mode: ModePrix, montant: number, montantTtc: number | null, taux: number | null, remise: number) =>
    row<{ montant_ht: number; montant_tva: number; montant_ttc_calc: number; taux_tva: number | null }>(
      await getBackend().rpc('calcul_prix', { mode, montant, montant_ttc: montantTtc, taux, remise })),
  timbre: async (montant: number) => Number(await getBackend().rpc('calcul_droit_timbre', { montant })),
};
