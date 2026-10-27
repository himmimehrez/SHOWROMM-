// Types alignés sur le schéma Supabase (supabase/migrations).
// Montants en DA (entiers). Dates : chaînes ISO (timestamptz) ou AAAA-MM-JJ (date).

export type Role = 'admin' | 'gerant' | 'commercial' | 'caissier' | 'agent_stock' | 'audit';

export interface Profile {
  id: string;
  email: string;
  nom: string;
  role: Role;
  actif: boolean;
  tous_depots: boolean;
  created_at: string;
}

export interface ProfileDepot { profile_id: string; depot_id: string }

export interface TimbreTranche { jusqua: number | null; par_100: number }

export interface ShopSettings {
  nom: string;
  forme_juridique: string;
  capital: string;
  activite: string;
  adresse: string;
  telephone: string;
  email: string;
  rc: string;
  nif: string;
  nis: string;
  article_imposition: string;
  mentions: string;
  categories_depenses: string[];
  remise_max_commercial: number;
  taux_tva: number[];
  plafond_especes: number;
  timbre: { exonere_jusqua: number; minimum: number; tranches: TimbreTranche[] };
}

export interface Depot {
  id: string;
  code: string;
  nom: string;
  adresse: string;
  responsable: string;
  actif: boolean;
}

export type Carburant = 'essence' | 'diesel' | 'hybride' | 'electrique' | 'gpl';
export type Boite = 'manuelle' | 'automatique';
export type EtatVehicule = 'neuf' | 'occasion' | 'en_preparation' | 'en_reparation' | 'endommage';
export type StatutVehicule = 'disponible' | 'reserve' | 'vendu' | 'livre' | 'bloque' | 'en_transit';

export interface Vehicule {
  id: string;
  reference: string;
  vin: string;
  immatriculation: string;
  marque: string;
  modele: string;
  finition: string;
  categorie: string;
  annee: number;
  couleur: string;
  carburant: Carburant;
  boite: Boite;
  puissance: string;
  kilometrage: number;
  etat: EtatVehicule;
  statut: StatutVehicule;
  depot_id: string;
  fournisseur_id: string | null;
  achat_id: string | null;
  prix_vente_ht: number;
  notes: string;
  demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface VehiculeCout { vehicule_id: string; prix_achat: number }

export type TypeMouvement =
  | 'entree_achat' | 'entree_manuelle' | 'transfert' | 'vente' | 'annulation_vente' | 'livraison' | 'blocage' | 'deblocage';

export interface Mouvement {
  id: string;
  vehicule_id: string;
  type: TypeMouvement;
  depot_from: string | null;
  depot_to: string | null;
  motif: string;
  ref: string;
  user_nom: string;
  date: string;
}

export interface Fournisseur {
  id: string;
  nom: string;
  telephone: string;
  adresse: string;
  nif_rc: string;
  notes: string;
  actif: boolean;
  created_at: string;
}

export type StatutAchat = 'commande' | 'partiel' | 'recu' | 'annule';

export interface Achat {
  id: string;
  numero: string;
  fournisseur_id: string;
  date: string;
  statut: StatutAchat;
  montant_total: number;
  notes: string;
  user_nom: string;
}

export interface AchatLigne {
  id: string;
  achat_id: string;
  position: number;
  marque: string;
  modele: string;
  finition: string;
  annee: number;
  couleur: string;
  vin: string;
  prix_achat: number;
  recu: boolean;
  vehicule_id: string | null;
}

export interface PaiementFournisseur {
  id: string;
  numero: string;
  achat_id: string;
  fournisseur_id: string;
  montant: number;
  mode: 'especes' | 'cheque' | 'virement' | 'traite';
  reference: string;
  user_nom: string;
  date: string;
}

export type StatutProspect = 'nouveau' | 'contacte' | 'interesse' | 'rendez_vous' | 'negociation' | 'converti' | 'perdu';
export type SourceProspect = 'visite' | 'telephone' | 'facebook' | 'whatsapp' | 'site_web' | 'recommandation' | 'autre';

export interface Client {
  id: string;
  type: 'particulier' | 'entreprise';
  nom: string;
  telephone: string;
  email: string;
  wilaya: string;
  adresse: string;
  piece_type: '' | 'cni' | 'passeport' | 'permis';
  piece_numero: string;
  rc: string;
  nif: string;
  nis: string;
  statut: StatutProspect;
  source: SourceProspect;
  vehicule_recherche: string;
  notes: string;
  demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Interaction {
  id: string;
  client_id: string;
  type: 'appel' | 'visite' | 'whatsapp' | 'email' | 'note';
  resume: string;
  prochaine_action: string;
  user_nom: string;
  date: string;
}

export type ModePrix = 'taux_ht' | 'taux_ttc' | 'montants' | 'direct';
export type StatutVente = 'confirmee' | 'livree' | 'annulee';

export interface Vente {
  id: string;
  numero: string;
  date: string;
  client_id: string;
  vehicule_id: string;
  depot_id: string;
  vehicule_libelle: string;
  vehicule_vin: string;
  mode_prix: ModePrix;
  taux_tva: number | null;
  prix_catalogue_ht: number;
  remise_ht: number;
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
  statut: StatutVente;
  commercial_nom: string;
  notes: string;
  facture_numero: string | null;
  facture_date: string | null;
  bon_sortie_numero: string | null;
  date_livraison: string | null;
  livraison_accord_par: string;
  annulation_motif: string;
  annulation_par: string;
  annulation_date: string | null;
  created_at: string;
}

export interface VenteCout { vente_id: string; cout_revient: number }

export interface VenteSolde {
  vente_id: string;
  montant_ttc: number;
  encaisse: number;
  cheques_en_attente: number;
  traites_en_portefeuille: number;
  droit_timbre: number;
}

export type ModePaiement = 'especes' | 'cheque' | 'cheque_certifie' | 'virement' | 'tpe' | 'traite';
export type StatutPaiement = 'confirme' | 'en_attente' | 'encaisse' | 'rejete' | 'en_portefeuille' | 'payee' | 'impayee' | 'annule';

export interface Paiement {
  id: string;
  numero: string;
  vente_id: string;
  client_id: string;
  sens: 'encaissement' | 'remboursement';
  mode: ModePaiement;
  montant: number;
  droit_timbre: number;
  statut: StatutPaiement;
  banque: string;
  reference: string;
  tireur: string;
  date_emission: string | null;
  echeance: string | null;
  motif: string;
  user_nom: string;
  date: string;
  statut_par: string;
  statut_date: string | null;
}

export interface CaisseSession {
  id: string;
  numero: string;
  statut: 'ouverte' | 'cloturee';
  fonds_initial: number;
  ouverte_par: string;
  ouverture: string;
  cloturee_par: string;
  cloture: string | null;
  theorique: number | null;
  compte: number | null;
  ecart: number | null;
  notes: string;
}

export type TypeMvtCaisse =
  | 'encaissement' | 'timbre' | 'remboursement' | 'depense' | 'annulation_depense' | 'paiement_fournisseur' | 'apport' | 'retrait';

export interface CaisseMouvement {
  id: string;
  session_id: string;
  type: TypeMvtCaisse;
  sens: 'in' | 'out';
  montant: number;
  motif: string;
  ref: string;
  user_nom: string;
  date: string;
}

export interface Depense {
  id: string;
  numero: string;
  categorie: string;
  libelle: string;
  montant: number;
  date: string; // AAAA-MM-JJ
  mode: 'especes' | 'cheque' | 'virement' | 'tpe';
  beneficiaire: string;
  vehicule_id: string | null;
  annulee: boolean;
  annulation_motif: string;
  user_nom: string;
  created_at: string;
}

export interface AuditLog {
  id: number;
  date: string;
  user_nom: string;
  action: string;
  objet: string;
  ref: string;
  details: string;
}
