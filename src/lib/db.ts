import Dexie, { type Table } from 'dexie';
import type {
  User, Setting, Depot, Vehicule, Mouvement, Fournisseur, Achat, PaiementFournisseur,
  Client, Interaction, Vente, Encaissement, Depense, CaisseSession, CaisseMouvement,
  Sequence, AuditLog,
} from './types';

// Persistance locale (IndexedDB). Toute écriture métier passe par src/lib/services.ts
// afin d'être atomique, numérotée et journalisée. Le jour où un backend est branché,
// seul ce fichier et services.ts changent : les pages n'accèdent jamais aux tables en écriture.
export class ShowroomDB extends Dexie {
  users!: Table<User, string>;
  settings!: Table<Setting, string>;
  depots!: Table<Depot, string>;
  vehicules!: Table<Vehicule, string>;
  mouvements!: Table<Mouvement, string>;
  fournisseurs!: Table<Fournisseur, string>;
  achats!: Table<Achat, string>;
  paiements_fournisseurs!: Table<PaiementFournisseur, string>;
  clients!: Table<Client, string>;
  interactions!: Table<Interaction, string>;
  ventes!: Table<Vente, string>;
  encaissements!: Table<Encaissement, string>;
  depenses!: Table<Depense, string>;
  caisse_sessions!: Table<CaisseSession, string>;
  caisse_mouvements!: Table<CaisseMouvement, string>;
  sequences!: Table<Sequence, string>;
  audit!: Table<AuditLog, string>;

  constructor(name = 'ShowroomManagerDZ') {
    super(name);
    this.version(1).stores({
      users: 'id, &login, role, actif',
      settings: 'key',
      depots: 'id, &code, actif',
      vehicules: 'id, &reference, vin, statut, depot_id, fournisseur_id, achat_id, marque, created_at',
      mouvements: 'id, vehicule_id, type, date',
      fournisseurs: 'id, nom, actif',
      achats: 'id, &numero, fournisseur_id, statut, date',
      paiements_fournisseurs: 'id, achat_id, fournisseur_id, session_id, date',
      clients: 'id, nom, telephone, statut, created_at',
      interactions: 'id, client_id, date',
      ventes: 'id, &numero, client_id, vehicule_id, statut, date',
      encaissements: 'id, &numero, vente_id, client_id, session_id, type, date',
      depenses: 'id, &numero, categorie, vehicule_id, session_id, date',
      caisse_sessions: 'id, &numero, statut, ouverture',
      caisse_mouvements: 'id, session_id, type, date',
      sequences: 'key',
      audit: 'id, date, user, action',
    });
  }
}

export let db = new ShowroomDB();

// Utilisé par les tests pour travailler sur une base isolée
export function useDatabase(instance: ShowroomDB) {
  db = instance;
}

export function uid(): string {
  return crypto.randomUUID();
}
