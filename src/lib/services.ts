/**
 * Services métier. Règles communes :
 *  - chaque opération vérifie les droits de l'utilisateur (assertCan) ;
 *  - chaque opération qui touche plusieurs tables s'exécute dans UNE transaction
 *    (tout ou rien : pas de vente sans mise à jour du véhicule, pas d'encaissement sans mouvement de caisse) ;
 *  - les contrôles (véhicule disponible, solde suffisant…) sont refaits DANS la transaction :
 *    un double clic ne peut donc pas créer deux ventes ou deux encaissements ;
 *  - les numéros de documents sont séquentiels et attribués dans la transaction ;
 *  - aucune opération financière validée n'est supprimée : on annule ou on contre-passe, et on journalise.
 */
import { db, uid } from './db';
import { assertCan, can } from './permissions';
import { currentYear } from './format';
import type {
  SessionUser, ShopSettings, Depot, Vehicule, Mouvement, TypeMouvement, Fournisseur, Achat,
  LigneAchat, ModePaiement, Client, Interaction, Vente, Encaissement, Depense, CaisseSession,
  CaisseMouvement, TypeMvtCaisse, AuditLog,
} from './types';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function fail(message: string): never {
  throw new ValidationError(message);
}

function positiveInt(v: unknown, label: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) fail(`${label} doit être un montant positif.`);
  return Math.round(n);
}

function nonNegativeInt(v: unknown, label: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) fail(`${label} ne peut pas être négatif.`);
  return Math.round(n);
}

function required(v: string | undefined, label: string): string {
  const s = (v ?? '').trim();
  if (!s) fail(`${label} est obligatoire.`);
  return s;
}

// ───────────────────────── Numérotation & journal ─────────────────────────

/** Numéro séquentiel par préfixe et par année : VTE-2026-00001. À appeler dans une transaction incluant db.sequences. */
export async function nextNumber(prefix: string, opts: { yearly?: boolean; pad?: number } = {}): Promise<string> {
  const { yearly = true, pad = 5 } = opts;
  const key = yearly ? `${prefix}-${currentYear()}` : prefix;
  const row = await db.sequences.get(key);
  const value = (row?.value ?? 0) + 1;
  await db.sequences.put({ key, value });
  return `${key}-${String(value).padStart(pad, '0')}`;
}

export async function audit(user: SessionUser, action: string, objet: string, ref: string, details = '') {
  const entry: AuditLog = { id: uid(), date: Date.now(), user: user.nom, action, objet, ref, details };
  await db.audit.add(entry);
}

// ───────────────────────── Paramètres & dépôts ─────────────────────────

export const DEFAULT_SETTINGS: ShopSettings = {
  nom: 'Mon showroom',
  adresse: '',
  telephone: '',
  nif_rc: '',
  mentions: '',
  categories_depenses: ['Transport', 'Préparation', 'Réparation', 'Formalités', 'Loyer', 'Électricité', 'Internet', 'Publicité', 'Fournitures', 'Divers'],
  remise_max_commercial: 50000,
};

export async function getSettings(): Promise<ShopSettings> {
  const row = await db.settings.get('shop');
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<ShopSettings>) ?? {}) };
}

export async function saveSettings(user: SessionUser, s: ShopSettings) {
  assertCan(user, 'parametres.gerer');
  required(s.nom, 'Le nom du showroom');
  const cats = Array.from(new Set(s.categories_depenses.map((c) => c.trim()).filter(Boolean)));
  if (cats.length === 0) fail('Gardez au moins une catégorie de dépense.');
  await db.transaction('rw', [db.settings, db.audit], async () => {
    await db.settings.put({ key: 'shop', value: { ...s, categories_depenses: cats, remise_max_commercial: nonNegativeInt(s.remise_max_commercial, 'La remise maximale') } });
    await audit(user, 'Paramètres modifiés', 'paramètres', 'shop');
  });
}

export async function saveDepot(user: SessionUser, input: Partial<Depot> & { code: string; nom: string }) {
  assertCan(user, 'parametres.gerer');
  const code = required(input.code, 'Le code du dépôt').toUpperCase();
  const nom = required(input.nom, 'Le nom du dépôt');
  return db.transaction('rw', [db.depots, db.audit], async () => {
    const same = await db.depots.where('code').equals(code).first();
    if (same && same.id !== input.id) fail(`Le code ${code} est déjà utilisé.`);
    const depot: Depot = {
      id: input.id ?? uid(), code, nom,
      adresse: input.adresse ?? '', responsable: input.responsable ?? '', actif: input.actif ?? true,
    };
    if (input.id && depot.actif === false) {
      const inside = await db.vehicules.where('depot_id').equals(input.id).filter((v) => v.statut !== 'livre').count();
      if (inside > 0) fail(`Impossible de désactiver : ${inside} véhicule(s) sont encore dans ce dépôt.`);
    }
    await db.depots.put(depot);
    await audit(user, input.id ? 'Dépôt modifié' : 'Dépôt créé', 'dépôt', code);
    return depot;
  });
}

// ───────────────────────── Véhicules & mouvements ─────────────────────────

async function addMouvement(user: SessionUser, m: Omit<Mouvement, 'id' | 'user' | 'date'>) {
  await db.mouvements.add({ ...m, id: uid(), user: user.nom, date: Date.now() });
}

async function assertVinFree(vin: string, exceptId?: string) {
  if (!vin) return;
  if (vin.length !== 17) fail('Le VIN doit comporter 17 caractères.');
  const dup = await db.vehicules.where('vin').equals(vin).filter((v) => v.id !== exceptId).first();
  if (dup) fail(`Ce VIN existe déjà (${dup.reference} — ${dup.marque} ${dup.modele}).`);
}

export type VehiculeInput = Pick<Vehicule,
  'vin' | 'immatriculation' | 'marque' | 'modele' | 'finition' | 'annee' | 'couleur' | 'carburant' | 'boite' |
  'kilometrage' | 'etat' | 'depot_id' | 'prix_achat' | 'prix_vente' | 'notes'> & { fournisseur_id?: string };

function cleanVehicule(input: VehiculeInput) {
  const annee = Number(input.annee);
  if (!Number.isInteger(annee) || annee < 1980 || annee > currentYear() + 1) fail("L'année du véhicule n'est pas valide.");
  return {
    vin: (input.vin ?? '').trim().toUpperCase(),
    immatriculation: (input.immatriculation ?? '').trim().toUpperCase(),
    marque: required(input.marque, 'La marque'),
    modele: required(input.modele, 'Le modèle'),
    finition: (input.finition ?? '').trim(),
    annee,
    couleur: (input.couleur ?? '').trim(),
    carburant: input.carburant,
    boite: input.boite,
    kilometrage: nonNegativeInt(input.kilometrage, 'Le kilométrage'),
    etat: input.etat,
    depot_id: required(input.depot_id, 'Le dépôt'),
    prix_achat: nonNegativeInt(input.prix_achat, "Le prix d'achat"),
    prix_vente: nonNegativeInt(input.prix_vente, 'Le prix de vente'),
    notes: (input.notes ?? '').trim(),
  };
}

/** Entrée manuelle d'un véhicule (hors bon d'achat : reprise, stock initial…) */
export async function createVehicule(user: SessionUser, input: VehiculeInput, opts: { demo?: boolean } = {}) {
  assertCan(user, 'vehicules.gerer');
  const data = cleanVehicule(input);
  return db.transaction('rw', [db.vehicules, db.mouvements, db.sequences, db.audit, db.depots], async () => {
    await assertVinFree(data.vin);
    if (!(await db.depots.get(data.depot_id))) fail('Dépôt introuvable.');
    const now = Date.now();
    const v: Vehicule = {
      ...data, id: uid(), reference: await nextNumber('VH', { yearly: false }), statut: 'disponible',
      fournisseur_id: input.fournisseur_id ?? '', achat_id: '', demo: opts.demo, created_at: now, updated_at: now,
    };
    await db.vehicules.add(v);
    await addMouvement(user, { vehicule_id: v.id, type: 'entree_manuelle', depot_from: '', depot_to: v.depot_id, motif: 'Entrée en stock', ref: v.reference });
    await audit(user, 'Véhicule créé', 'véhicule', v.reference, `${v.marque} ${v.modele}`);
    return v;
  });
}

/** Modification de la fiche. Le statut et le dépôt ne se modifient pas ici (voir ventes et transferts). */
export async function updateVehicule(user: SessionUser, id: string, input: VehiculeInput) {
  assertCan(user, 'vehicules.gerer');
  const data = cleanVehicule(input);
  return db.transaction('rw', [db.vehicules, db.audit], async () => {
    const v = await db.vehicules.get(id);
    if (!v) fail('Véhicule introuvable.');
    if (v.statut === 'livre') fail('Un véhicule livré ne peut plus être modifié.');
    await assertVinFree(data.vin, id);
    if (data.prix_vente !== v.prix_vente) {
      assertCan(user, 'vehicules.prix');
      await audit(user, 'Prix de vente modifié', 'véhicule', v.reference, `${v.prix_vente} → ${data.prix_vente} DA`);
    }
    if (data.prix_achat !== v.prix_achat) {
      assertCan(user, 'couts.voir');
      await audit(user, "Prix d'achat modifié", 'véhicule', v.reference, `${v.prix_achat} → ${data.prix_achat} DA`);
    }
    const { depot_id: _ignored, ...rest } = data;
    await db.vehicules.update(id, { ...rest, updated_at: Date.now() });
    await audit(user, 'Véhicule modifié', 'véhicule', v.reference);
  });
}

export async function transfererVehicule(user: SessionUser, id: string, depotTo: string, motif: string) {
  assertCan(user, 'stock.transferer');
  return db.transaction('rw', [db.vehicules, db.depots, db.mouvements, db.audit], async () => {
    const v = await db.vehicules.get(id);
    if (!v) fail('Véhicule introuvable.');
    if (v.statut === 'livre') fail('Ce véhicule est déjà sorti du parc.');
    if (v.depot_id === depotTo) fail('Le véhicule est déjà dans ce dépôt.');
    const to = await db.depots.get(depotTo);
    if (!to || !to.actif) fail('Dépôt de destination introuvable ou inactif.');
    await db.vehicules.update(id, { depot_id: depotTo, updated_at: Date.now() });
    await addMouvement(user, { vehicule_id: id, type: 'transfert', depot_from: v.depot_id, depot_to: depotTo, motif: required(motif, 'Le motif'), ref: v.reference });
    await audit(user, 'Transfert de dépôt', 'véhicule', v.reference, `vers ${to.code}`);
  });
}

export async function bloquerVehicule(user: SessionUser, id: string, bloquer: boolean, motif: string) {
  assertCan(user, 'stock.transferer');
  return db.transaction('rw', [db.vehicules, db.mouvements, db.audit], async () => {
    const v = await db.vehicules.get(id);
    if (!v) fail('Véhicule introuvable.');
    if (bloquer && v.statut !== 'disponible') fail('Seul un véhicule disponible peut être bloqué.');
    if (!bloquer && v.statut !== 'bloque') fail("Ce véhicule n'est pas bloqué.");
    await db.vehicules.update(id, { statut: bloquer ? 'bloque' : 'disponible', updated_at: Date.now() });
    const type: TypeMouvement = bloquer ? 'blocage' : 'deblocage';
    await addMouvement(user, { vehicule_id: id, type, depot_from: v.depot_id, depot_to: v.depot_id, motif: required(motif, 'Le motif'), ref: v.reference });
    await audit(user, bloquer ? 'Véhicule bloqué' : 'Véhicule débloqué', 'véhicule', v.reference, motif);
  });
}

/** Coût de revient = prix d'achat + frais annexes non annulés rattachés au véhicule */
export function coutRevient(v: Vehicule, depenses: Depense[]): number {
  return v.prix_achat + depenses.filter((d) => d.vehicule_id === v.id && !d.annulee).reduce((s, d) => s + d.montant, 0);
}

// ───────────────────────── Clients ─────────────────────────

export type ClientInput = Omit<Client, 'id' | 'created_at' | 'updated_at' | 'demo'> & { id?: string };

export async function saveClient(user: SessionUser, input: ClientInput, opts: { demo?: boolean } = {}) {
  assertCan(user, 'clients.gerer');
  const nom = required(input.nom, 'Le nom');
  const telephone = (input.telephone ?? '').replace(/\s+/g, ' ').trim();
  if (telephone && !/^[0-9+ ]{9,16}$/.test(telephone)) fail("Le numéro de téléphone n'est pas valide.");
  return db.transaction('rw', [db.clients, db.audit], async () => {
    const now = Date.now();
    const existing = input.id ? await db.clients.get(input.id) : undefined;
    const c: Client = {
      ...input, nom, telephone,
      email: (input.email ?? '').trim(),
      id: existing?.id ?? uid(),
      demo: existing?.demo ?? opts.demo,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    await db.clients.put(c);
    await audit(user, existing ? 'Client modifié' : 'Client créé', 'client', c.nom);
    return c;
  });
}

export async function addInteraction(user: SessionUser, input: Omit<Interaction, 'id' | 'user' | 'date'>) {
  assertCan(user, 'clients.gerer');
  required(input.resume, 'Le résumé');
  await db.interactions.add({ ...input, id: uid(), user: user.nom, date: Date.now() });
}

// ───────────────────────── Caisse ─────────────────────────

export async function getOpenSession(): Promise<CaisseSession | undefined> {
  return db.caisse_sessions.where('statut').equals('ouverte').first();
}

export function soldeTheorique(session: CaisseSession, mouvements: CaisseMouvement[]): number {
  return mouvements
    .filter((m) => m.session_id === session.id)
    .reduce((s, m) => s + (m.sens === 'in' ? m.montant : -m.montant), session.fonds_initial);
}

/** Les espèces exigent une session de caisse ouverte ; les autres modes ne touchent pas la caisse physique. */
async function cashMovement(user: SessionUser, mode: ModePaiement, type: TypeMvtCaisse, sens: 'in' | 'out', montant: number, motif: string, ref: string): Promise<string> {
  if (mode !== 'especes') return '';
  const session = await getOpenSession();
  if (!session) fail('Aucune caisse ouverte : ouvrez une session de caisse avant toute opération en espèces.');
  if (sens === 'out') {
    const mvts = await db.caisse_mouvements.where('session_id').equals(session.id).toArray();
    const dispo = soldeTheorique(session, mvts);
    if (montant > dispo) fail(`Espèces insuffisantes en caisse (disponible : ${dispo.toLocaleString('fr-FR')} DA).`);
  }
  await db.caisse_mouvements.add({ id: uid(), session_id: session.id, type, sens, montant, motif, ref, user: user.nom, date: Date.now() });
  return session.id;
}

const CASH_TABLES = () => [db.caisse_sessions, db.caisse_mouvements];

export async function ouvrirCaisse(user: SessionUser, fondsInitial: number) {
  assertCan(user, 'caisse.operer');
  const fonds = nonNegativeInt(fondsInitial, 'Le fonds de caisse');
  return db.transaction('rw', [...CASH_TABLES(), db.sequences, db.audit], async () => {
    if (await getOpenSession()) fail('Une session de caisse est déjà ouverte.');
    const s: CaisseSession = {
      id: uid(), numero: await nextNumber('CAI'), statut: 'ouverte', fonds_initial: fonds,
      ouverte_par: user.nom, ouverture: Date.now(), cloturee_par: '', cloture: 0, theorique: 0, compte: 0, ecart: 0, notes: '',
    };
    await db.caisse_sessions.add(s);
    await audit(user, 'Caisse ouverte', 'caisse', s.numero, `Fonds initial ${fonds} DA`);
    return s;
  });
}

export async function apportRetrait(user: SessionUser, type: 'apport' | 'retrait', montant: number, motif: string) {
  assertCan(user, 'caisse.operer');
  const m = positiveInt(montant, 'Le montant');
  const label = required(motif, 'Le motif');
  return db.transaction('rw', [...CASH_TABLES(), db.audit], async () => {
    await cashMovement(user, 'especes', type, type === 'apport' ? 'in' : 'out', m, label, '');
    await audit(user, type === 'apport' ? 'Apport en caisse' : 'Retrait de caisse', 'caisse', '', `${m} DA — ${label}`);
  });
}

export async function cloturerCaisse(user: SessionUser, montantCompte: number, notes: string) {
  assertCan(user, 'caisse.operer');
  const compte = nonNegativeInt(montantCompte, 'Le montant compté');
  return db.transaction('rw', [...CASH_TABLES(), db.audit], async () => {
    const s = await getOpenSession();
    if (!s) fail('Aucune caisse ouverte.');
    const mvts = await db.caisse_mouvements.where('session_id').equals(s.id).toArray();
    const theorique = soldeTheorique(s, mvts);
    const ecart = compte - theorique;
    await db.caisse_sessions.update(s.id, {
      statut: 'cloturee', cloturee_par: user.nom, cloture: Date.now(), theorique, compte, ecart, notes: notes.trim(),
    });
    await audit(user, 'Caisse clôturée', 'caisse', s.numero, `Théorique ${theorique} DA, compté ${compte} DA, écart ${ecart} DA`);
    return { theorique, compte, ecart };
  });
}

// ───────────────────────── Ventes & encaissements ─────────────────────────

export function montantPaye(venteId: string, encaissements: Encaissement[]): number {
  return encaissements
    .filter((e) => e.vente_id === venteId)
    .reduce((s, e) => s + (e.type === 'paiement' ? e.montant : -e.montant), 0);
}

export function soldeVente(v: Vente, encaissements: Encaissement[]): number {
  if (v.statut === 'annulee') return 0;
  return v.total_net - montantPaye(v.id, encaissements);
}

const VENTE_TABLES = () => [
  db.ventes, db.vehicules, db.clients, db.encaissements, db.mouvements, db.depenses, db.settings,
  db.sequences, db.audit, ...CASH_TABLES(),
];

export interface VenteInput {
  client_id: string;
  vehicule_id: string;
  remise: number;
  notes: string;
  acompte?: { montant: number; mode: ModePaiement; reference: string };
}

export async function createVente(user: SessionUser, input: VenteInput) {
  assertCan(user, 'ventes.creer');
  const remise = nonNegativeInt(input.remise, 'La remise');
  if (input.acompte && input.acompte.montant > 0) assertCan(user, 'caisse.operer');
  return db.transaction('rw', VENTE_TABLES(), async () => {
    const client = await db.clients.get(input.client_id);
    if (!client) fail('Sélectionnez un client.');
    const v = await db.vehicules.get(input.vehicule_id);
    if (!v) fail('Sélectionnez un véhicule.');
    // Contrôle refait dans la transaction : empêche la vente simultanée d'un même véhicule
    if (v.statut !== 'disponible') fail(`Le véhicule ${v.reference} n'est plus disponible (statut : ${v.statut}).`);
    if (v.prix_vente <= 0) fail("Ce véhicule n'a pas de prix de vente. Renseignez-le avant de vendre.");
    if (remise > v.prix_vente) fail('La remise dépasse le prix du véhicule.');
    const settings = await getSettings();
    if (remise > settings.remise_max_commercial && !can(user, 'ventes.remise')) {
      fail(`Remise supérieure à ${settings.remise_max_commercial.toLocaleString('fr-FR')} DA : autorisation du gérant requise.`);
    }
    const frais = await db.depenses.where('vehicule_id').equals(v.id).toArray();
    const now = Date.now();
    const vente: Vente = {
      id: uid(), numero: await nextNumber('VTE'), date: now, client_id: client.id, vehicule_id: v.id,
      vehicule_libelle: `${v.marque} ${v.modele}${v.finition ? ' ' + v.finition : ''} (${v.annee})`,
      vehicule_vin: v.vin, prix_catalogue: v.prix_vente, remise, total_net: v.prix_vente - remise,
      cout_revient: coutRevient(v, frais), statut: 'confirmee', commercial: user.nom, notes: (input.notes ?? '').trim(),
      bon_sortie_numero: '', date_livraison: 0, annulation_motif: '', annulation_user: '', annulation_date: 0, created_at: now,
    };
    await db.ventes.add(vente);
    await db.vehicules.update(v.id, { statut: 'vendu', updated_at: now });
    await addMouvement(user, { vehicule_id: v.id, type: 'vente', depot_from: v.depot_id, depot_to: v.depot_id, motif: `Vendu à ${client.nom}`, ref: vente.numero });
    if (client.statut !== 'converti') await db.clients.update(client.id, { statut: 'converti', updated_at: now });
    await audit(user, 'Vente créée', 'vente', vente.numero, `${vente.vehicule_libelle} — ${vente.total_net} DA`);
    if (input.acompte && input.acompte.montant > 0) {
      await encaisserInTx(user, vente, input.acompte.montant, input.acompte.mode, input.acompte.reference, []);
    }
    return vente;
  });
}

async function encaisserInTx(user: SessionUser, vente: Vente, montant: number, mode: ModePaiement, reference: string, existing: Encaissement[]) {
  const m = positiveInt(montant, 'Le montant');
  const solde = vente.total_net - montantPaye(vente.id, existing);
  if (m > solde) fail(`Le montant dépasse le reste à payer (${solde.toLocaleString('fr-FR')} DA).`);
  if ((mode === 'cheque' || mode === 'virement') && !reference.trim()) fail('Indiquez la référence du chèque ou du virement.');
  const numero = await nextNumber('REC');
  const session_id = await cashMovement(user, mode, 'encaissement', 'in', m, `Règlement ${vente.numero}`, numero);
  const e: Encaissement = {
    id: uid(), numero, type: 'paiement', vente_id: vente.id, client_id: vente.client_id, montant: m, mode,
    reference: reference.trim(), session_id, user: user.nom, date: Date.now(),
  };
  await db.encaissements.add(e);
  await audit(user, 'Encaissement', 'vente', vente.numero, `${numero} — ${m} DA (${mode})`);
  return e;
}

export async function encaisser(user: SessionUser, venteId: string, montant: number, mode: ModePaiement, reference = '') {
  assertCan(user, 'caisse.operer');
  return db.transaction('rw', VENTE_TABLES(), async () => {
    const vente = await db.ventes.get(venteId);
    if (!vente) fail('Vente introuvable.');
    if (vente.statut === 'annulee') fail('Cette vente est annulée.');
    const existing = await db.encaissements.where('vente_id').equals(venteId).toArray();
    return encaisserInTx(user, vente, montant, mode, reference, existing);
  });
}

export async function rembourser(user: SessionUser, venteId: string, montant: number, mode: ModePaiement, motif: string) {
  assertCan(user, 'caisse.rembourser');
  const m = positiveInt(montant, 'Le montant');
  const label = required(motif, 'Le motif du remboursement');
  return db.transaction('rw', VENTE_TABLES(), async () => {
    const vente = await db.ventes.get(venteId);
    if (!vente) fail('Vente introuvable.');
    if (vente.statut === 'livree') fail('Véhicule déjà livré : un retour doit être traité avant tout remboursement.');
    const existing = await db.encaissements.where('vente_id').equals(venteId).toArray();
    const paye = montantPaye(venteId, existing);
    if (m > paye) fail(`Le remboursement dépasse le montant encaissé (${paye.toLocaleString('fr-FR')} DA).`);
    const numero = await nextNumber('RMB');
    const session_id = await cashMovement(user, mode, 'remboursement', 'out', m, `Remboursement ${vente.numero}`, numero);
    await db.encaissements.add({
      id: uid(), numero, type: 'remboursement', vente_id: vente.id, client_id: vente.client_id, montant: m, mode,
      reference: label, session_id, user: user.nom, date: Date.now(),
    });
    await audit(user, 'Remboursement', 'vente', vente.numero, `${numero} — ${m} DA — ${label}`);
  });
}

export async function livrerVente(user: SessionUser, venteId: string) {
  assertCan(user, 'ventes.livrer');
  return db.transaction('rw', VENTE_TABLES(), async () => {
    const vente = await db.ventes.get(venteId);
    if (!vente) fail('Vente introuvable.');
    if (vente.statut !== 'confirmee') fail('Seule une vente confirmée peut être livrée.');
    const existing = await db.encaissements.where('vente_id').equals(venteId).toArray();
    const solde = soldeVente(vente, existing);
    if (solde > 0) fail(`Livraison bloquée : il reste ${solde.toLocaleString('fr-FR')} DA à payer.`);
    const v = await db.vehicules.get(vente.vehicule_id);
    const numero = await nextNumber('BS');
    const now = Date.now();
    await db.ventes.update(venteId, { statut: 'livree', bon_sortie_numero: numero, date_livraison: now });
    if (v) {
      await db.vehicules.update(v.id, { statut: 'livre', updated_at: now });
      await addMouvement(user, { vehicule_id: v.id, type: 'livraison', depot_from: v.depot_id, depot_to: '', motif: 'Sortie du parc — livraison client', ref: numero });
    }
    await audit(user, 'Véhicule livré', 'vente', vente.numero, `Bon de sortie ${numero}`);
    return numero;
  });
}

export async function annulerVente(user: SessionUser, venteId: string, motif: string) {
  assertCan(user, 'ventes.annuler');
  const label = required(motif, "Le motif d'annulation");
  return db.transaction('rw', VENTE_TABLES(), async () => {
    const vente = await db.ventes.get(venteId);
    if (!vente) fail('Vente introuvable.');
    if (vente.statut !== 'confirmee') fail('Seule une vente confirmée (non livrée) peut être annulée.');
    const existing = await db.encaissements.where('vente_id').equals(venteId).toArray();
    const paye = montantPaye(venteId, existing);
    if (paye > 0) fail(`Remboursez d'abord les ${paye.toLocaleString('fr-FR')} DA encaissés avant d'annuler.`);
    const now = Date.now();
    await db.ventes.update(venteId, { statut: 'annulee', annulation_motif: label, annulation_user: user.nom, annulation_date: now });
    const v = await db.vehicules.get(vente.vehicule_id);
    if (v) {
      await db.vehicules.update(v.id, { statut: 'disponible', updated_at: now });
      await addMouvement(user, { vehicule_id: v.id, type: 'annulation_vente', depot_from: v.depot_id, depot_to: v.depot_id, motif: label, ref: vente.numero });
    }
    await audit(user, 'Vente annulée', 'vente', vente.numero, label);
  });
}

// ───────────────────────── Dépenses ─────────────────────────

export interface DepenseInput {
  categorie: string;
  libelle: string;
  montant: number;
  date: number;
  mode: ModePaiement;
  beneficiaire: string;
  vehicule_id: string;
}

export async function createDepense(user: SessionUser, input: DepenseInput) {
  assertCan(user, 'depenses.gerer');
  const montant = positiveInt(input.montant, 'Le montant');
  const categorie = required(input.categorie, 'La catégorie');
  const libelle = required(input.libelle, 'Le libellé');
  return db.transaction('rw', [db.depenses, db.vehicules, db.sequences, db.audit, ...CASH_TABLES()], async () => {
    if (input.vehicule_id) {
      const v = await db.vehicules.get(input.vehicule_id);
      if (!v) fail('Véhicule introuvable.');
      if (v.statut === 'livre') fail('Ce véhicule est déjà livré : ses frais ne peuvent plus être modifiés.');
    }
    const numero = await nextNumber('DEP');
    const session_id = await cashMovement(user, input.mode, 'depense', 'out', montant, `${categorie} — ${libelle}`, numero);
    const d: Depense = {
      id: uid(), numero, categorie, libelle, montant, date: input.date || Date.now(), mode: input.mode,
      beneficiaire: (input.beneficiaire ?? '').trim(), vehicule_id: input.vehicule_id ?? '', session_id,
      annulee: false, annulation_motif: '', user: user.nom, created_at: Date.now(),
    };
    await db.depenses.add(d);
    await audit(user, 'Dépense enregistrée', 'dépense', numero, `${montant} DA — ${libelle}`);
    return d;
  });
}

export async function annulerDepense(user: SessionUser, id: string, motif: string) {
  assertCan(user, 'depenses.annuler');
  const label = required(motif, "Le motif d'annulation");
  return db.transaction('rw', [db.depenses, db.audit, ...CASH_TABLES()], async () => {
    const d = await db.depenses.get(id);
    if (!d) fail('Dépense introuvable.');
    if (d.annulee) fail('Cette dépense est déjà annulée.');
    // Contre-passation : les espèces sorties reviennent dans la caisse ouverte
    await cashMovement(user, d.mode, 'annulation_depense', 'in', d.montant, `Annulation ${d.numero}`, d.numero);
    await db.depenses.update(id, { annulee: true, annulation_motif: label });
    await audit(user, 'Dépense annulée', 'dépense', d.numero, label);
  });
}

// ───────────────────────── Fournisseurs & achats ─────────────────────────

export async function saveFournisseur(user: SessionUser, input: Partial<Fournisseur> & { nom: string }) {
  assertCan(user, 'fournisseurs.gerer');
  const nom = required(input.nom, 'Le nom du fournisseur');
  return db.transaction('rw', [db.fournisseurs, db.audit], async () => {
    const existing = input.id ? await db.fournisseurs.get(input.id) : undefined;
    const f: Fournisseur = {
      id: existing?.id ?? uid(), nom, telephone: (input.telephone ?? '').trim(), adresse: (input.adresse ?? '').trim(),
      nif_rc: (input.nif_rc ?? '').trim(), notes: (input.notes ?? '').trim(), actif: input.actif ?? true,
      created_at: existing?.created_at ?? Date.now(),
    };
    await db.fournisseurs.put(f);
    await audit(user, existing ? 'Fournisseur modifié' : 'Fournisseur créé', 'fournisseur', nom);
    return f;
  });
}

export type LigneAchatInput = Omit<LigneAchat, 'id' | 'recu' | 'vehicule_id'>;

export async function createAchat(user: SessionUser, input: { fournisseur_id: string; lignes: LigneAchatInput[]; notes: string }) {
  assertCan(user, 'achats.gerer');
  if (input.lignes.length === 0) fail('Ajoutez au moins un véhicule à la commande.');
  const lignes: LigneAchat[] = input.lignes.map((l, i) => {
    const vin = (l.vin ?? '').trim().toUpperCase();
    if (vin && vin.length !== 17) fail(`Ligne ${i + 1} : le VIN doit comporter 17 caractères.`);
    return {
      id: uid(), marque: required(l.marque, `Ligne ${i + 1} : la marque`), modele: required(l.modele, `Ligne ${i + 1} : le modèle`),
      finition: (l.finition ?? '').trim(), annee: Number(l.annee) || currentYear(), couleur: (l.couleur ?? '').trim(), vin,
      prix_achat: positiveInt(l.prix_achat, `Ligne ${i + 1} : le prix d'achat`), recu: false, vehicule_id: '',
    };
  });
  const vins = lignes.map((l) => l.vin).filter(Boolean);
  if (new Set(vins).size !== vins.length) fail('Le même VIN apparaît deux fois dans la commande.');
  return db.transaction('rw', [db.achats, db.fournisseurs, db.vehicules, db.sequences, db.audit], async () => {
    const f = await db.fournisseurs.get(input.fournisseur_id);
    if (!f) fail('Sélectionnez un fournisseur.');
    for (const vin of vins) await assertVinFree(vin);
    const a: Achat = {
      id: uid(), numero: await nextNumber('ACH'), fournisseur_id: f.id, date: Date.now(), statut: 'commande', lignes,
      montant_total: lignes.reduce((s, l) => s + l.prix_achat, 0), notes: (input.notes ?? '').trim(), user: user.nom, created_at: Date.now(),
    };
    await db.achats.add(a);
    await audit(user, "Commande d'achat créée", 'achat', a.numero, `${f.nom} — ${a.montant_total} DA`);
    return a;
  });
}

/** Réception d'une ligne : c'est seulement ici que le véhicule entre en stock. */
export async function receptionnerLigne(
  user: SessionUser, achatId: string, ligneId: string,
  data: { depot_id: string; vin: string; prix_vente: number; kilometrage: number; etat: Vehicule['etat']; carburant: Vehicule['carburant']; boite: Vehicule['boite'] },
  opts: { demo?: boolean } = {},
) {
  assertCan(user, 'achats.gerer');
  return db.transaction('rw', [db.achats, db.vehicules, db.depots, db.mouvements, db.sequences, db.audit], async () => {
    const a = await db.achats.get(achatId);
    if (!a) fail('Commande introuvable.');
    if (a.statut === 'annule') fail('Cette commande est annulée.');
    const ligne = a.lignes.find((l) => l.id === ligneId);
    if (!ligne) fail('Ligne introuvable.');
    if (ligne.recu) fail('Ce véhicule a déjà été réceptionné.');
    const depot = await db.depots.get(data.depot_id);
    if (!depot || !depot.actif) fail('Choisissez un dépôt de réception actif.');
    const vin = (data.vin || ligne.vin).trim().toUpperCase();
    await assertVinFree(vin);
    const now = Date.now();
    const v: Vehicule = {
      id: uid(), reference: await nextNumber('VH', { yearly: false }), vin, immatriculation: '', marque: ligne.marque,
      modele: ligne.modele, finition: ligne.finition, annee: ligne.annee, couleur: ligne.couleur,
      carburant: data.carburant, boite: data.boite, kilometrage: nonNegativeInt(data.kilometrage, 'Le kilométrage'),
      etat: data.etat, statut: 'disponible', depot_id: depot.id, fournisseur_id: a.fournisseur_id, achat_id: a.id,
      prix_achat: ligne.prix_achat, prix_vente: nonNegativeInt(data.prix_vente, 'Le prix de vente'), notes: '',
      demo: opts.demo, created_at: now, updated_at: now,
    };
    await db.vehicules.add(v);
    const lignes = a.lignes.map((l) => (l.id === ligneId ? { ...l, recu: true, vin, vehicule_id: v.id } : l));
    const statut = lignes.every((l) => l.recu) ? 'recu' : 'partiel';
    await db.achats.update(achatId, { lignes, statut });
    await addMouvement(user, { vehicule_id: v.id, type: 'entree_achat', depot_from: '', depot_to: depot.id, motif: `Réception ${a.numero}`, ref: a.numero });
    await audit(user, 'Réception véhicule', 'achat', a.numero, `${v.reference} — ${v.marque} ${v.modele} → ${depot.code}`);
    return v;
  });
}

export async function annulerAchat(user: SessionUser, achatId: string, motif: string) {
  assertCan(user, 'achats.gerer');
  const label = required(motif, "Le motif d'annulation");
  return db.transaction('rw', [db.achats, db.paiements_fournisseurs, db.audit], async () => {
    const a = await db.achats.get(achatId);
    if (!a) fail('Commande introuvable.');
    if (a.statut !== 'commande') fail('Une commande déjà (partiellement) réceptionnée ne peut pas être annulée.');
    const paid = await db.paiements_fournisseurs.where('achat_id').equals(achatId).count();
    if (paid > 0) fail('Des paiements existent sur cette commande : elle ne peut pas être annulée.');
    await db.achats.update(achatId, { statut: 'annule', notes: `${a.notes}\nAnnulée : ${label}`.trim() });
    await audit(user, 'Commande annulée', 'achat', a.numero, label);
  });
}

export async function payerFournisseur(user: SessionUser, achatId: string, montant: number, mode: ModePaiement, reference: string) {
  assertCan(user, 'achats.gerer');
  const m = positiveInt(montant, 'Le montant');
  return db.transaction('rw', [db.achats, db.paiements_fournisseurs, db.sequences, db.audit, ...CASH_TABLES()], async () => {
    const a = await db.achats.get(achatId);
    if (!a) fail('Commande introuvable.');
    if (a.statut === 'annule') fail('Cette commande est annulée.');
    const paid = (await db.paiements_fournisseurs.where('achat_id').equals(achatId).toArray()).reduce((s, p) => s + p.montant, 0);
    const reste = a.montant_total - paid;
    if (m > reste) fail(`Le montant dépasse le reste dû (${reste.toLocaleString('fr-FR')} DA).`);
    if (mode === 'especes') assertCan(user, 'caisse.operer');
    const numero = await nextNumber('PFR');
    const session_id = await cashMovement(user, mode, 'paiement_fournisseur', 'out', m, `Paiement ${a.numero}`, numero);
    await db.paiements_fournisseurs.add({
      id: uid(), numero, achat_id: a.id, fournisseur_id: a.fournisseur_id, montant: m, mode, reference: reference.trim(),
      session_id, user: user.nom, date: Date.now(),
    });
    await audit(user, 'Paiement fournisseur', 'achat', a.numero, `${numero} — ${m} DA (${mode})`);
  });
}

// ───────────────────────── Sauvegarde ─────────────────────────

export async function exportBackup(user: SessionUser) {
  assertCan(user, 'parametres.gerer');
  const out: Record<string, unknown[]> = {};
  for (const table of db.tables) {
    if (table.name === 'users') {
      out.users = (await table.toArray()).map((u: { pwdHash?: string; salt?: string }) => ({ ...u, pwdHash: undefined, salt: undefined }));
    } else {
      out[table.name] = await table.toArray();
    }
  }
  await audit(user, 'Export de sauvegarde', 'données', '');
  return { app: 'showroom-manager-dz', version: 1, exported_at: new Date().toISOString(), data: out };
}
