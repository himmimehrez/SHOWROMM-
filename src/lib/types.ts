// Modèle de données Showroom Manager DZ
// Montants en dinars algériens (DA), entiers. Dates en millisecondes (epoch).

export type Role = 'admin' | 'gerant' | 'commercial' | 'caissier';

export interface User {
  id: string;
  login: string;
  nom: string;
  role: Role;
  pwdHash: string;
  salt: string;
  actif: boolean;
  created_at: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

export interface ShopSettings {
  nom: string;
  adresse: string;
  telephone: string;
  nif_rc: string;
  mentions: string;
  categories_depenses: string[];
  remise_max_commercial: number; // en DA, au-delà : autorisation gérant
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
export type StatutVehicule = 'disponible' | 'reserve' | 'vendu' | 'livre' | 'bloque';

export interface Vehicule {
  id: string;
  reference: string; // VH-00001
  vin: string;
  immatriculation: string;
  marque: string;
  modele: string;
  finition: string;
  annee: number;
  couleur: string;
  carburant: Carburant;
  boite: Boite;
  kilometrage: number;
  etat: EtatVehicule;
  statut: StatutVehicule;
  depot_id: string;
  fournisseur_id: string;
  achat_id: string;
  prix_achat: number;
  prix_vente: number;
  notes: string;
  demo?: boolean;
  created_at: number;
  updated_at: number;
}

export type TypeMouvement =
  | 'entree_achat'
  | 'entree_manuelle'
  | 'transfert'
  | 'vente'
  | 'annulation_vente'
  | 'livraison'
  | 'blocage'
  | 'deblocage';

export interface Mouvement {
  id: string;
  vehicule_id: string;
  type: TypeMouvement;
  depot_from: string;
  depot_to: string;
  motif: string;
  ref: string; // numéro de l'opération d'origine
  user: string;
  date: number;
}

export interface Fournisseur {
  id: string;
  nom: string;
  telephone: string;
  adresse: string;
  nif_rc: string;
  notes: string;
  actif: boolean;
  created_at: number;
}

export interface LigneAchat {
  id: string;
  marque: string;
  modele: string;
  finition: string;
  annee: number;
  couleur: string;
  vin: string;
  prix_achat: number;
  recu: boolean;
  vehicule_id: string;
}

export type StatutAchat = 'commande' | 'partiel' | 'recu' | 'annule';

export interface Achat {
  id: string;
  numero: string;
  fournisseur_id: string;
  date: number;
  statut: StatutAchat;
  lignes: LigneAchat[];
  montant_total: number;
  notes: string;
  user: string;
  created_at: number;
}

export type ModePaiement = 'especes' | 'cheque' | 'virement' | 'tpe';

export interface PaiementFournisseur {
  id: string;
  numero: string;
  achat_id: string;
  fournisseur_id: string;
  montant: number;
  mode: ModePaiement;
  reference: string;
  session_id: string;
  user: string;
  date: number;
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
  piece_type: 'cni' | 'passeport' | 'permis' | '';
  piece_numero: string;
  nif_rc: string;
  statut: StatutProspect;
  source: SourceProspect;
  vehicule_recherche: string;
  notes: string;
  demo?: boolean;
  created_at: number;
  updated_at: number;
}

export interface Interaction {
  id: string;
  client_id: string;
  type: 'appel' | 'visite' | 'whatsapp' | 'email' | 'note';
  resume: string;
  prochaine_action: string;
  date: number;
  user: string;
}

export type StatutVente = 'confirmee' | 'livree' | 'annulee';

export interface Vente {
  id: string;
  numero: string; // VTE-2026-00001
  date: number;
  client_id: string;
  vehicule_id: string;
  // Instantané au moment de la vente : ne change pas si la fiche véhicule change
  vehicule_libelle: string;
  vehicule_vin: string;
  prix_catalogue: number;
  remise: number;
  total_net: number;
  cout_revient: number; // prix d'achat + frais connus à la date de vente
  statut: StatutVente;
  commercial: string;
  notes: string;
  bon_sortie_numero: string;
  date_livraison: number;
  annulation_motif: string;
  annulation_user: string;
  annulation_date: number;
  created_at: number;
}

export interface Encaissement {
  id: string;
  numero: string; // REC-2026-00001 ou RMB-2026-00001
  type: 'paiement' | 'remboursement';
  vente_id: string;
  client_id: string;
  montant: number; // toujours positif
  mode: ModePaiement;
  reference: string;
  session_id: string;
  user: string;
  date: number;
}

export interface Depense {
  id: string;
  numero: string; // DEP-2026-00001
  categorie: string;
  libelle: string;
  montant: number;
  date: number;
  mode: ModePaiement;
  beneficiaire: string;
  vehicule_id: string; // frais annexes rattachés à un véhicule
  session_id: string;
  annulee: boolean;
  annulation_motif: string;
  user: string;
  created_at: number;
}

export interface CaisseSession {
  id: string;
  numero: string;
  statut: 'ouverte' | 'cloturee';
  fonds_initial: number;
  ouverte_par: string;
  ouverture: number;
  cloturee_par: string;
  cloture: number;
  theorique: number;
  compte: number;
  ecart: number;
  notes: string;
}

export type TypeMvtCaisse =
  | 'encaissement'
  | 'remboursement'
  | 'depense'
  | 'annulation_depense'
  | 'paiement_fournisseur'
  | 'apport'
  | 'retrait';

export interface CaisseMouvement {
  id: string;
  session_id: string;
  type: TypeMvtCaisse;
  sens: 'in' | 'out';
  montant: number;
  motif: string;
  ref: string;
  user: string;
  date: number;
}

export interface Sequence {
  key: string;
  value: number;
}

export interface AuditLog {
  id: string;
  date: number;
  user: string;
  action: string;
  objet: string;
  ref: string;
  details: string;
}

export interface SessionUser {
  id: string;
  nom: string;
  login: string;
  role: Role;
}
