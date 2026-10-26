// Tests des règles métier sur les VRAIS services (base IndexedDB simulée en mémoire).
import 'fake-indexeddb/auto';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ShowroomDB, useDatabase, db } from '../src/lib/db';
import * as S from '../src/lib/services';
import { setupFirstAdmin, login, createUser } from '../src/lib/auth';
import type { SessionUser } from '../src/lib/types';

const store = new Map<string, string>();
(globalThis as any).sessionStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

let admin: SessionUser;
let n = 0;

async function freshDb() {
  useDatabase(new ShowroomDB(`test-${++n}`));
  admin = await setupFirstAdmin({ nom: 'Admin Test', login: 'admin', password: 'motdepasse1', shop: 'Test' });
}

async function depot() {
  return (await db.depots.toArray())[0];
}

async function stockVehicule(prixAchat = 5_000_000, prixVente = 6_000_000) {
  const d = await depot();
  return S.createVehicule(admin, {
    vin: '', immatriculation: '', marque: 'Toyota', modele: 'Hilux', finition: '', annee: 2025, couleur: 'Blanc',
    carburant: 'diesel', boite: 'manuelle', kilometrage: 0, etat: 'neuf', depot_id: d.id, prix_achat: prixAchat, prix_vente: prixVente, notes: '',
  });
}

async function client() {
  return S.saveClient(admin, {
    type: 'particulier', nom: 'Client Test', telephone: '0550123456', email: '', wilaya: '', adresse: '', piece_type: '',
    piece_numero: '', nif_rc: '', statut: 'nouveau', source: 'visite', vehicule_recherche: '', notes: '',
  });
}

describe('Showroom — règles métier', () => {
  beforeEach(freshDb);

  it('connexion : mot de passe faux refusé, bon mot de passe accepté', async () => {
    await assert.rejects(login('admin', 'mauvais123'), /incorrect/);
    const u = await login('admin', 'motdepasse1');
    assert.equal(u.role, 'admin');
  });

  it('numérotation séquentielle sans trou', async () => {
    const a = await stockVehicule();
    const b = await stockVehicule();
    assert.equal(a.reference, 'VH-00001');
    assert.equal(b.reference, 'VH-00002');
  });

  it('refuse un VIN en double', async () => {
    const d = await depot();
    const base = { immatriculation: '', marque: 'Kia', modele: 'Sportage', finition: '', annee: 2025, couleur: '', carburant: 'essence' as const, boite: 'automatique' as const, kilometrage: 0, etat: 'neuf' as const, depot_id: d.id, prix_achat: 1, prix_vente: 2, notes: '' };
    await S.createVehicule(admin, { ...base, vin: 'KNAPX81ABCD123456' });
    await assert.rejects(S.createVehicule(admin, { ...base, vin: 'KNAPX81ABCD123456' }), /existe déjà/);
  });

  it('un véhicule ne peut être vendu qu’une seule fois, même en double clic', async () => {
    const v = await stockVehicule();
    const c = await client();
    const results = await Promise.allSettled([
      S.createVente(admin, { client_id: c.id, vehicule_id: v.id, remise: 0, notes: '' }),
      S.createVente(admin, { client_id: c.id, vehicule_id: v.id, remise: 0, notes: '' }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(await db.ventes.count(), 1);
    assert.equal((await db.vehicules.get(v.id))!.statut, 'vendu');
  });

  it('l’encaissement espèces exige une caisse ouverte et ne dépasse pas le solde', async () => {
    const v = await stockVehicule();
    const c = await client();
    const vente = await S.createVente(admin, { client_id: c.id, vehicule_id: v.id, remise: 100_000, notes: '' });
    assert.equal(vente.total_net, 5_900_000);
    await assert.rejects(S.encaisser(admin, vente.id, 1000, 'especes'), /Aucune caisse ouverte/);
    await S.ouvrirCaisse(admin, 10_000);
    await S.encaisser(admin, vente.id, 900_000, 'especes');
    await assert.rejects(S.encaisser(admin, vente.id, 5_000_001, 'virement', 'VIR1'), /dépasse le reste/);
    const enc = await db.encaissements.toArray();
    assert.equal(S.soldeVente((await db.ventes.get(vente.id))!, enc), 5_000_000);
  });

  it('le paiement électronique ne change pas la caisse physique ; clôture et écart', async () => {
    const v = await stockVehicule();
    const c = await client();
    await S.ouvrirCaisse(admin, 50_000);
    const vente = await S.createVente(admin, { client_id: c.id, vehicule_id: v.id, remise: 0, notes: '' });
    await S.encaisser(admin, vente.id, 200_000, 'especes');
    await S.encaisser(admin, vente.id, 1_000_000, 'cheque', 'CHQ1');
    await S.createDepense(admin, { categorie: 'Divers', libelle: 'Café', montant: 3_000, date: Date.now(), mode: 'especes', beneficiaire: '', vehicule_id: '' });
    const res = await S.cloturerCaisse(admin, 246_500, '');
    assert.equal(res.theorique, 50_000 + 200_000 - 3_000);
    assert.equal(res.ecart, -500);
    assert.equal(await S.getOpenSession(), undefined);
  });

  it('livraison bloquée tant que le solde n’est pas réglé', async () => {
    const v = await stockVehicule(1_000_000, 2_000_000);
    const c = await client();
    const vente = await S.createVente(admin, { client_id: c.id, vehicule_id: v.id, remise: 0, notes: '' });
    await assert.rejects(S.livrerVente(admin, vente.id), /reste 2/);
    await S.encaisser(admin, vente.id, 2_000_000, 'virement', 'VIR');
    const bs = await S.livrerVente(admin, vente.id);
    assert.match(bs, /^BS-\d{4}-00001$/);
    assert.equal((await db.vehicules.get(v.id))!.statut, 'livre');
  });

  it('annulation : rembourser d’abord, puis le véhicule redevient disponible', async () => {
    const v = await stockVehicule();
    const c = await client();
    await S.ouvrirCaisse(admin, 0);
    const vente = await S.createVente(admin, { client_id: c.id, vehicule_id: v.id, remise: 0, notes: '', acompte: { montant: 100_000, mode: 'especes', reference: '' } });
    await assert.rejects(S.annulerVente(admin, vente.id, 'Client désiste'), /Remboursez/);
    await S.rembourser(admin, vente.id, 100_000, 'especes', 'Désistement');
    await S.annulerVente(admin, vente.id, 'Client désiste');
    assert.equal((await db.vehicules.get(v.id))!.statut, 'disponible');
    assert.equal((await db.ventes.get(vente.id))!.statut, 'annulee');
    assert.equal(await db.encaissements.count(), 2); // rien n'est supprimé
  });

  it('un achat n’entre en stock qu’à la réception', async () => {
    const f = await S.saveFournisseur(admin, { nom: 'Fournisseur' });
    const a = await S.createAchat(admin, { fournisseur_id: f.id, notes: '', lignes: [
      { marque: 'Fiat', modele: '500', finition: '', annee: 2025, couleur: '', vin: '', prix_achat: 3_000_000 },
      { marque: 'Fiat', modele: 'Tipo', finition: '', annee: 2025, couleur: '', vin: '', prix_achat: 3_500_000 },
    ] });
    assert.equal(await db.vehicules.count(), 0);
    const d = await depot();
    await S.receptionnerLigne(admin, a.id, a.lignes[0].id, { depot_id: d.id, vin: '', prix_vente: 3_400_000, kilometrage: 0, etat: 'neuf', carburant: 'essence', boite: 'manuelle' });
    assert.equal(await db.vehicules.count(), 1);
    assert.equal((await db.achats.get(a.id))!.statut, 'partiel');
    await assert.rejects(S.receptionnerLigne(admin, a.id, a.lignes[0].id, { depot_id: d.id, vin: '', prix_vente: 1, kilometrage: 0, etat: 'neuf', carburant: 'essence', boite: 'manuelle' }), /déjà été réceptionné/);
  });

  it('les frais annexes entrent dans le coût de revient sans double comptage', async () => {
    const v = await stockVehicule(5_000_000, 6_000_000);
    const d = await S.createDepense(admin, { categorie: 'Transport', libelle: 'Transport', montant: 80_000, date: Date.now(), mode: 'virement', beneficiaire: '', vehicule_id: v.id });
    let deps = await db.depenses.toArray();
    assert.equal(S.coutRevient(v, deps), 5_080_000);
    await S.annulerDepense(admin, d.id, 'Erreur de saisie');
    deps = await db.depenses.toArray();
    assert.equal(S.coutRevient(v, deps), 5_000_000);
  });

  it('un commercial ne peut pas encaisser ni dépasser le plafond de remise', async () => {
    await createUser(admin, { nom: 'Com', login: 'com1', password: 'commercial1', role: 'commercial' });
    const com = await login('com1', 'commercial1');
    const v = await stockVehicule();
    const c = await client();
    await assert.rejects(S.createVente(com, { client_id: c.id, vehicule_id: v.id, remise: 200_000, notes: '' }), /autorisation du gérant/);
    const vente = await S.createVente(com, { client_id: c.id, vehicule_id: v.id, remise: 10_000, notes: '' });
    await assert.rejects(S.encaisser(com, vente.id, 1000, 'virement', 'X'), /non autorisée/);
  });
});
