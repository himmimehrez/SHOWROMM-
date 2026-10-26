import Dexie, { type Table } from 'dexie';
import type {
  Vehicule,
  Depot,
  Client,
  ClientDoc,
  Vente,
  TransactionCaisse,
  Echeance,
  SyncQueueItem,
  AuditLog,
  FraisVehicule,
  InteractionClient,
} from '../types';

export class AutoGestionDatabase extends Dexie {
  vehicules!: Table<Vehicule, string>;
  depots!: Table<Depot, string>;
  clients!: Table<Client, string>;
  documents_kyc!: Table<ClientDoc, string>;
  ventes!: Table<Vente, string>;
  transactions_caisse!: Table<TransactionCaisse, string>;
  echeances!: Table<Echeance, string>;
  sync_queue!: Table<SyncQueueItem, string>;
  audit_logs!: Table<AuditLog, string>;
  frais_vehicules!: Table<FraisVehicule, string>;
  interactions_clients!: Table<InteractionClient, string>;

  constructor() {
    super('AutoGestionDZ_DB');
    this.version(1).stores({
      vehicules: 'id, vin, marque, modele, statut, depot_actuel, prix_achat_dzd, prix_vente_dzd, updated_at',
      depots: 'id, code, nom, wilaya',
      clients: 'id, nom_complet, telephone, piece_identite_numero, updated_at',
      documents_kyc: 'id, client_id, type_doc, sha256, sync_status, created_at',
      ventes: 'id, numero_contrat, client_id, vehicule_id, statut_validation, statut_paiement, bon_sortie_autorise, updated_at',
      transactions_caisse: 'id, numero_recu, vente_id, type, mode_paiement, date_transaction, created_at',
      echeances: 'id, vente_id, client_id, date_echeance, statut',
      sync_queue: 'id, status, createdAt, entityType, entityId, idempotencyKey',
      audit_logs: 'id, timestamp, action, user, device_id',
    });

    // Version 2 : Extension Étape A (Frais annexes, Marge & CRM Interactions)
    this.version(2).stores({
      frais_vehicules: 'id, vehicule_id, categorie, date_frais, created_at',
      interactions_clients: 'id, client_id, type, date, created_at',
    }).upgrade(async (tx) => {
      // Migration sans perte des véhicules existants
      await tx.table('vehicules').toCollection().modify((v: any) => {
        if (!v.etat_physique) {
          v.etat_physique = v.kilometrage === 0 ? 'neuf' : 'occasion';
        }
        if (v.total_frais_annexes_dzd === undefined) {
          v.total_frais_annexes_dzd = 0;
        }
        if (v.marge_estimee_dzd === undefined) {
          v.marge_estimee_dzd = (v.prix_vente_dzd || 0) - (v.prix_achat_dzd || 0);
        }
      });

      // Migration sans perte des clients existants
      await tx.table('clients').toCollection().modify((c: any) => {
        if (!c.statut_prospect) {
          c.statut_prospect = 'converti';
        }
        if (!c.source_prospect) {
          c.source_prospect = 'visite_showroom';
        }
      });
    });
  }
}

export const db = new AutoGestionDatabase();

// Initialisation et amorçage avec les données du showroom algérien
export async function seedInitialDataIfEmpty() {
  const depotsCount = await db.depots.count();
  if (depotsCount === 0) {
    const initialDepots: Depot[] = [
      {
        id: 'showroom',
        code: 'SHW-HYDRA',
        nom: "Showroom Principal Val d'Hydra",
        nom_ar: 'المعرض الرئيسي حيدرة',
        type: 'showroom',
        wilaya: '16 - Alger',
        capacite: 25,
        responsable: 'Karim Hadj',
      },
      {
        id: 'parc',
        code: 'PARC-SMAR',
        nom: 'Parc de Stockage Central Oued Smar',
        nom_ar: 'حظيرة التخزين المركزية وادي السمار',
        type: 'parc_stockage',
        wilaya: '16 - Alger',
        capacite: 120,
        responsable: 'Mustapha Benali',
      },
      {
        id: 'transit',
        code: 'TRN-PORT',
        nom: "Zone Transit Port d'Alger",
        nom_ar: 'منطقة العبور ميناء الجزائر',
        type: 'transit_port',
        wilaya: '16 - Alger',
        capacite: 40,
        responsable: 'Rachid Mebarki',
      },
    ];
    await db.depots.bulkAdd(initialDepots);
  }

  const vehiculesCount = await db.vehicules.count();
  if (vehiculesCount === 0) {
    const now = Date.now();
    const initialVehicules: Vehicule[] = [
      {
        id: 'v-hilux-01',
        vin: 'AHTFZ29G800123456',
        marque: 'Toyota',
        modele: 'Hilux Double Cabine',
        version: 'Adventure 2.8 D-4D 4x4 BVA',
        annee: 2025,
        couleur: 'Blanc Nacré',
        kilometrage: 0,
        carburant: 'diesel',
        boite: 'automatique',
        etat_physique: 'neuf',
        prix_achat_dzd: 7200000,
        prix_vente_dzd: 8150000,
        total_frais_annexes_dzd: 120000,
        marge_estimee_dzd: 830000, // 8150000 - 7200000 - 120000
        statut: 'en_stock',
        depot_actuel: 'showroom',
        notes: 'Pack Off-Road cuir noir, arceau sport, clim bizone.',
        version_seq: 1,
        updated_at: now,
        created_at: now,
      },
      {
        id: 'v-tucson-02',
        vin: 'KMHJ881BBPU234567',
        marque: 'Hyundai',
        modele: 'Tucson N-Line',
        version: '1.6 T-GDI 180ch HTRAC',
        annee: 2025,
        couleur: 'Gris Minéral',
        kilometrage: 0,
        carburant: 'essence',
        boite: 'automatique',
        etat_physique: 'neuf',
        prix_achat_dzd: 6300000,
        prix_vente_dzd: 7100000,
        total_frais_annexes_dzd: 80000,
        marge_estimee_dzd: 720000,
        statut: 'en_stock',
        depot_actuel: 'showroom',
        notes: 'Toit panoramique, jantes 19 pouces, son Krell.',
        version_seq: 1,
        updated_at: now,
        created_at: now,
      },
      {
        id: 'v-coolray-03',
        vin: 'LB37525A4P0345678',
        marque: 'Geely',
        modele: 'Coolray',
        version: '1.5 Turbo GF Flagship Sport',
        annee: 2025,
        couleur: 'Bleu Électrique',
        kilometrage: 0,
        carburant: 'essence',
        boite: 'automatique',
        etat_physique: 'neuf',
        prix_achat_dzd: 4100000,
        prix_vente_dzd: 4680000,
        total_frais_annexes_dzd: 60000,
        marge_estimee_dzd: 520000,
        statut: 'en_stock',
        depot_actuel: 'parc',
        notes: 'Caméra 540°, sièges sport bicolores.',
        version_seq: 1,
        updated_at: now,
        created_at: now,
      },
      {
        id: 'v-tiggo-04',
        vin: 'LVVDA21B5PD456789',
        marque: 'Chery',
        modele: 'Tiggo 8 Pro Max',
        version: '2.0 TGDI 254ch AWD 7 Places',
        annee: 2025,
        couleur: 'Noir Intense',
        kilometrage: 0,
        carburant: 'essence',
        boite: 'automatique',
        etat_physique: 'neuf',
        prix_achat_dzd: 5500000,
        prix_vente_dzd: 6250000,
        total_frais_annexes_dzd: 95000,
        marge_estimee_dzd: 655000,
        statut: 'reserve',
        depot_actuel: 'showroom',
        notes: 'Réservé pour M. Belkacem. Acompte reçu.',
        version_seq: 2,
        updated_at: now,
        created_at: now,
      },
      {
        id: 'v-stepway-05',
        vin: 'VF15DJ20571567890',
        marque: 'Dacia',
        modele: 'Sandero Stepway',
        version: '1.0 TCe 90ch Extreme',
        annee: 2024,
        couleur: 'Vert Cèdre',
        kilometrage: 1250,
        carburant: 'essence',
        boite: 'manuelle',
        etat_physique: 'occasion',
        prix_achat_dzd: 3200000,
        prix_vente_dzd: 3650000,
        total_frais_annexes_dzd: 45000,
        marge_estimee_dzd: 405000,
        statut: 'en_stock',
        depot_actuel: 'parc',
        notes: 'Véhicule quasi-neuf de démonstration.',
        version_seq: 1,
        updated_at: now,
        created_at: now,
      },
      {
        id: 'v-fiat-06',
        vin: 'ZFA3340000P678901',
        marque: 'Fiat',
        modele: '500X Hybrid',
        version: 'Dolcevita 1.5 130ch DCT',
        annee: 2024,
        couleur: 'Rouge Passione',
        kilometrage: 0,
        carburant: 'hybride',
        boite: 'automatique',
        etat_physique: 'en_preparation',
        prix_achat_dzd: 3850000,
        prix_vente_dzd: 4350000,
        total_frais_annexes_dzd: 50000,
        marge_estimee_dzd: 450000,
        statut: 'en_stock',
        depot_actuel: 'transit',
        notes: 'En cours de formalités portuaires.',
        version_seq: 1,
        updated_at: now,
        created_at: now,
      },
    ];
    await db.vehicules.bulkAdd(initialVehicules);

    // Initialisation d'exemples de frais annexes
    const initialFrais: FraisVehicule[] = [
      {
        id: 'fr-01',
        vehicule_id: 'v-hilux-01',
        categorie: 'transport',
        montant_dzd: 70000,
        description: 'Transport porte-voiture Alger - Hydra',
        fournisseur_beneficiaire: 'SARL TransAuto DZ',
        date_frais: now - 172800000,
        cree_par: 'Karim Hadj',
        created_at: now - 172800000,
      },
      {
        id: 'fr-02',
        vehicule_id: 'v-hilux-01',
        categorie: 'preparation',
        montant_dzd: 50000,
        description: 'Nettoyage professionnel et pose de cire protectrice',
        fournisseur_beneficiaire: 'Atelier Val d Hydra',
        date_frais: now - 86400000,
        cree_par: 'Mustapha Benali',
        created_at: now - 86400000,
      },
      {
        id: 'fr-03',
        vehicule_id: 'v-tucson-02',
        categorie: 'formalites',
        montant_dzd: 80000,
        description: 'Dossier de conformité et contrôle technique',
        fournisseur_beneficiaire: 'Centre Contrôle Technique Oued Smar',
        date_frais: now - 86400000,
        cree_par: 'Karim Hadj',
        created_at: now - 86400000,
      },
    ];
    await db.frais_vehicules.bulkAdd(initialFrais);
  }

  const clientsCount = await db.clients.count();
  if (clientsCount === 0) {
    const now = Date.now();
    const initialClients: Client[] = [
      {
        id: 'c-01',
        type: 'particulier',
        nom_complet: 'Sofiane Belkacem',
        nom_arabe: 'سفيان بلقاسم',
        telephone: '0550 12 34 56',
        email: 'sofiane.belkacem@gmail.com',
        wilaya: '16 - Alger',
        commune: 'Hydra',
        adresse: '12 Rue Doudou Mokhtar, Hydra',
        piece_identite_type: 'cni',
        piece_identite_numero: '109845231012',
        piece_identite_expiration: '2030-08-14',
        statut_prospect: 'converti',
        source_prospect: 'visite_showroom',
        budget_estime_dzd: 6500000,
        vehicule_recherche: 'Chery Tiggo 8 Pro Max',
        documents_ids: ['doc-cni-01'],
        updated_at: now,
        created_at: now,
      },
      {
        id: 'c-02',
        type: 'entreprise',
        nom_complet: 'SARL Atlas Logistics DZ',
        nom_arabe: 'ش.ذ.م.م أطلس للخدمات اللوجستية',
        telephone: '0661 98 76 54',
        email: 'contact@atlaslogistics-dz.com',
        wilaya: '09 - Blida',
        commune: 'Boufarik',
        adresse: 'Zone Industrielle Boufarik, Lot 4',
        piece_identite_type: 'cni',
        piece_identite_numero: '208761234055',
        nif_nis_rc: 'RC: 09/00-128459B21 · NIF: 002109012845963',
        statut_prospect: 'negociation',
        source_prospect: 'recommandation',
        budget_estime_dzd: 8000000,
        vehicule_recherche: 'Toyota Hilux 4x4',
        documents_ids: [],
        updated_at: now,
        created_at: now,
      },
      {
        id: 'c-03',
        type: 'particulier',
        nom_complet: 'Amine Djebbar',
        nom_arabe: 'أمين جبار',
        telephone: '0770 45 67 89',
        email: 'amine.djebbar@gmail.com',
        wilaya: '31 - Oran',
        commune: 'Es Senia',
        adresse: 'Cité 200 Logements, Oran',
        piece_identite_type: 'permis',
        piece_identite_numero: '3198004523',
        statut_prospect: 'interesse',
        source_prospect: 'facebook',
        budget_estime_dzd: 4500000,
        vehicule_recherche: 'Geely Coolray GF',
        documents_ids: [],
        updated_at: now,
        created_at: now,
      },
    ];
    await db.clients.bulkAdd(initialClients);

    // Initialisation d'exemples d'interactions CRM
    const initialInteractions: InteractionClient[] = [
      {
        id: 'int-01',
        client_id: 'c-01',
        type: 'visite',
        date: now - 172800000,
        resume: 'Visite du showroom, essai statique du Tiggo 8 Pro 7 places. Très intéressé par la finition noire.',
        auteur: 'Sofiane Mansouri',
        prochaine_action: 'Finalisation contrat de réservation',
        created_at: now - 172800000,
      },
      {
        id: 'int-02',
        client_id: 'c-02',
        type: 'appel',
        date: now - 86400000,
        resume: 'Discussion sur la disponibilité de 2 Hilux Double Cabine pour flotte logistique.',
        auteur: 'Karim Hadj',
        prochaine_action: 'Envoi facture proforma',
        date_rappel: '2026-10-30',
        created_at: now - 86400000,
      },
    ];
    await db.interactions_clients.bulkAdd(initialInteractions);

    const sampleKycDoc: ClientDoc = {
      id: 'doc-cni-01',
      client_id: 'c-01',
      type_doc: 'cni_recto',
      nom_fichier: 'CNI_Recto_Belkacem.jpg',
      taille_octets: 184520,
      mime_type: 'image/jpeg',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      is_encrypted: false,
      data_blob_base64: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250" viewBox="0 0 400 250"><rect width="400" height="250" fill="%231e293b" rx="10"/><rect x="20" y="20" width="360" height="210" fill="%230f172a" rx="8" stroke="%2338bdf8" stroke-width="2"/><text x="40" y="60" fill="%2338bdf8" font-size="16" font-family="sans-serif" font-weight="bold">RÉPUBLIQUE ALGÉRIENNE DÉMOCRATIQUE ET POPULAIRE</text><text x="40" y="85" fill="%2394a3b8" font-size="12" font-family="sans-serif">CARTE NATIONALE D IDENTITÉ BIOMÉTRIQUE</text><rect x="40" y="110" width="80" height="100" fill="%23334155" rx="4"/><text x="140" y="130" fill="%23f8fafc" font-size="14" font-weight="bold">BELKACEM</text><text x="140" y="155" fill="%23cbd5e1" font-size="13">SOFIANE</text><text x="140" y="180" fill="%2394a3b8" font-size="12">N° 109845231012</text><text x="140" y="200" fill="%2310b981" font-size="11">Valide jusqu au: 14/08/2030</text></svg>',
      sync_status: 'synced',
      serveur_url: '/api/documents/doc-cni-01',
      created_at: now,
    };
    await db.documents_kyc.add(sampleKycDoc);
  }

  const ventesCount = await db.ventes.count();
  if (ventesCount === 0) {
    const now = Date.now();
    const initialVente: Vente = {
      id: 'vte-2026-0001',
      numero_contrat: 'CTR-2026-0001',
      numero_facture: 'FAC-2026-0001',
      client_id: 'c-01',
      vehicule_id: 'v-tiggo-04',
      date_vente: now - 86400000,
      prix_vente_dzd: 6250000,
      remise_dzd: 50000,
      total_net_dzd: 6200000,
      montant_encaisse_dzd: 2000000,
      solde_restant_dzd: 4200000,
      statut_validation: 'confirme_central',
      statut_paiement: 'acompte',
      bon_sortie_autorise: false,
      device_id: 'DEV-SRV',
      created_offline: false,
      updated_at: now,
      created_at: now,
    };
    await db.ventes.add(initialVente);

    const initialCaisse: TransactionCaisse = {
      id: 'tr-0001',
      numero_recu: 'REC-2026-0001',
      vente_id: 'vte-2026-0001',
      client_id: 'c-01',
      type: 'acompte_reservation',
      mode_paiement: 'cheque',
      montant_dzd: 2000000,
      reference_bancaire: 'CHQ-8849201',
      banque: 'BNA - Banque Nationale d Algérie',
      date_transaction: now - 86400000,
      motif: 'Acompte réservation Chery Tiggo 8 Pro Max',
      encaisse_par: 'Karim Hadj',
      device_id: 'DEV-SRV',
      created_at: now,
    };
    await db.transactions_caisse.add(initialCaisse);

    const initialEcheance: Echeance = {
      id: 'ech-0001',
      vente_id: 'vte-2026-0001',
      client_id: 'c-01',
      date_echeance: '2026-11-15',
      montant_prevu_dzd: 4200000,
      montant_paye_dzd: 0,
      statut: 'en_attente',
      updated_at: now,
    };
    await db.echeances.add(initialEcheance);
  }
}
