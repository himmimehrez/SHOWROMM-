export type VehicleStatus = 'en_stock' | 'reserve' | 'vendu' | 'livre';
export type VehicleCondition = 'neuf' | 'occasion' | 'en_preparation' | 'en_reparation' | 'endommage';
export type FuelType = 'essence' | 'diesel' | 'hybride' | 'electrique' | 'gpl';
export type TransmissionType = 'manuelle' | 'automatique';
export type DepotId = 'showroom' | 'parc' | 'transit';

export type FraisCategorie = 'transport' | 'preparation' | 'reparation' | 'formalites' | 'autre';

export interface FraisVehicule {
  id: string;
  vehicule_id: string;
  categorie: FraisCategorie;
  montant_dzd: number;
  description: string;
  fournisseur_beneficiaire?: string;
  date_frais: number;
  cree_par: string;
  created_at: number;
}

export interface HistoriquePrixItem {
  date: number;
  ancien_prix_dzd: number;
  nouveau_prix_dzd: number;
  motif: string;
  auteur: string;
}

export interface Vehicule {
  id: string; // UUID
  vin: string; // 17 characters VIN
  marque: string; // Toyota, Hyundai, Geely, Chery, Dacia, etc.
  modele: string; // Tucson, Hilux, Coolray, etc.
  version?: string;
  annee: number; // 2024, 2025, 2026
  couleur: string;
  kilometrage: number; // 0 for new
  carburant: FuelType;
  boite: TransmissionType;
  etat_physique: VehicleCondition;
  prix_achat_dzd: number; // Saisie directe du prix d'achat retenu
  prix_vente_dzd: number; // Prix catalogue
  total_frais_annexes_dzd?: number;
  marge_estimee_dzd?: number;
  statut: VehicleStatus;
  depot_actuel: DepotId;
  immatriculation?: string;
  images?: string[];
  notes?: string;
  historique_prix?: HistoriquePrixItem[];
  version_seq: number;
  updated_at: number;
  created_at: number;
}

export interface Depot {
  id: DepotId;
  code: string;
  nom: string;
  nom_ar: string;
  type: 'showroom' | 'parc_stockage' | 'transit_port';
  wilaya: string;
  capacite: number;
  responsable: string;
}

export type ClientDocType = 'cni_recto' | 'cni_verso' | 'passeport' | 'permis' | 'residence' | 'rc_nif';

export interface ClientDoc {
  id: string;
  client_id: string;
  type_doc: ClientDocType;
  nom_fichier: string;
  taille_octets: number;
  mime_type: string;
  sha256: string; // Checksum SHA-256
  is_encrypted: boolean; // Chiffré localement AES-GCM
  data_blob_base64: string; // Données d'image ou PDF
  sync_status: 'pending' | 'syncing' | 'synced' | 'error';
  serveur_url?: string;
  uploaded_at?: number;
  created_at: number;
}

export type ProspectStatus = 'nouveau' | 'contacte' | 'interesse' | 'rendez_vous' | 'negociation' | 'converti' | 'perdu';
export type ProspectSource = 'visite_showroom' | 'telephone' | 'facebook' | 'whatsapp' | 'site_web' | 'recommandation' | 'autre';
export type InteractionType = 'appel' | 'visite' | 'whatsapp' | 'email' | 'note';

export interface InteractionClient {
  id: string;
  client_id: string;
  type: InteractionType;
  date: number;
  resume: string;
  auteur: string;
  prochaine_action?: string;
  date_rappel?: string;
  created_at: number;
}

export interface Client {
  id: string;
  type: 'particulier' | 'entreprise';
  nom_complet: string;
  nom_arabe?: string;
  telephone: string;
  email?: string;
  wilaya: string;
  commune: string;
  adresse: string;
  piece_identite_type: 'cni' | 'passeport' | 'permis';
  piece_identite_numero: string;
  piece_identite_expiration?: string;
  nif_nis_rc?: string;
  statut_prospect: ProspectStatus;
  source_prospect: ProspectSource;
  budget_estime_dzd?: number;
  vehicule_recherche?: string;
  notes?: string;
  documents_ids: string[];
  updated_at: number;
  created_at: number;
}

export type VenteValidationStatus = 'provisoire_local' | 'confirme_central' | 'conflit_allocation';
export type PaymentStatus = 'solde' | 'acompte' | 'echeancier' | 'impaye';
export type PaymentMode = 'especes' | 'cheque' | 'virement' | 'traite';

export interface Vente {
  id: string;
  numero_contrat: string;
  numero_facture?: string;
  client_id: string;
  vehicule_id: string;
  date_vente: number;
  prix_vente_dzd: number;
  remise_dzd: number;
  total_net_dzd: number;
  montant_encaisse_dzd: number;
  solde_restant_dzd: number;
  statut_validation: VenteValidationStatus;
  statut_paiement: PaymentStatus;
  bon_sortie_autorise: boolean;
  bon_sortie_numero?: string;
  date_sortie?: number;
  device_id: string;
  conflit_detail?: string;
  created_offline: boolean;
  updated_at: number;
  created_at: number;
}

export type CaisseType = 'recette_vente' | 'acompte_reservation' | 'depense_generale' | 'remboursement_annulation';

export interface TransactionCaisse {
  id: string;
  numero_recu: string;
  vente_id?: string;
  client_id?: string;
  type: CaisseType;
  mode_paiement: PaymentMode;
  montant_dzd: number;
  reference_bancaire?: string;
  banque?: string;
  date_transaction: number;
  motif: string;
  encaisse_par: string;
  device_id: string;
  created_at: number;
}

export interface Echeance {
  id: string;
  vente_id: string;
  client_id: string;
  date_echeance: string; // YYYY-MM-DD
  montant_prevu_dzd: number;
  montant_paye_dzd: number;
  statut: 'en_attente' | 'paye' | 'en_retard';
  updated_at: number;
}

export type SyncAction = 'CREATE' | 'UPDATE' | 'DELETE';
export type SyncEntity = 'vehicule' | 'client' | 'vente' | 'caisse' | 'echeance' | 'document' | 'frais' | 'interaction';
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'conflict' | 'error';

export interface SyncQueueItem {
  id: string;
  deviceId: string;
  idempotencyKey: string;
  entityType: SyncEntity;
  entityId: string;
  action: SyncAction;
  payload: any;
  createdAt: number;
  status: SyncStatus;
  retryCount: number;
  lastAttemptAt?: number;
  errorMessage?: string;
}

export interface AuditLog {
  id: string;
  timestamp: number;
  action: string;
  details: string;
  user: string;
  device_id: string;
  sync_ref?: string;
}

export interface UserSession {
  id: string;
  nom: string;
  role: 'gerant' | 'commercial' | 'caissier' | 'chef_parc';
  code_pin: string;
  device_id: string;
  device_name: string;
  derniere_activite: number;
  is_locked: boolean;
}

export interface SyncStats {
  isOnline: boolean;
  isSimulatedOffline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  conflictCount: number;
  errorCount: number;
  lastSyncTimestamp: number;
  lastServerSeq: number;
  latencyMs: number;
}
