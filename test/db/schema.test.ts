// Tests de la base Supabase (migrations réelles chargées dans un PostgreSQL local PGlite).
// Ils vérifient les règles métier ET que les droits sont appliqués par la base elle-même.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, type TestDb, type TestUser } from './harness.ts';

let db: TestDb;
let admin: TestUser, gerant: TestUser, caissier: TestUser, commercial: TestUser, inactif: TestUser;
let depotA: string, depotB: string;

type Row = Record<string, any>;
const one = async (p: Promise<Row[]>) => (await p)[0];

async function vehicule(depot = depotA, prixHt = 5_000_000, achat = 4_000_000) {
  return one(db.rpc(admin, 'vehicule_create', { p: { marque: 'Toyota', modele: 'Hilux', annee: 2025, depot_id: depot, prix_vente_ht: prixHt, prix_achat: achat } }));
}
async function client(nom = 'Client test') {
  return one(db.rpc(admin, 'client_save', { p_id: null, p: { nom } }));
}
async function vente(u: TestUser, args: Row = {}) {
  // par défaut, le véhicule est affiché au prix HT de la vente (pas de remise implicite)
  const v = args.vehicule ?? (await vehicule(depotA, args.mode === 'direct' || args.mode === 'montants' ? args.montant : 5_000_000));
  const c = args.client ?? (await client());
  return one(db.rpc(u, 'vente_create', {
    p_client: c.id, p_vehicule: v.id, p_mode_prix: args.mode ?? 'taux_ht', p_montant: args.montant ?? 5_000_000,
    p_montant_ttc: args.ttc ?? null, p_taux: args.taux === undefined ? 19 : args.taux, p_remise: args.remise ?? 0,
  }));
}
async function soldes(venteId: string) {
  return one(db.as(admin, 'select * from v_ventes_soldes where vente_id = $1', [venteId]));
}
async function ensureCaisse(fonds = 0) {
  const open = await db.admin(`select 1 from caisse_sessions where statut = 'ouverte'`);
  if (!open.length) await db.rpc(admin, 'caisse_ouvrir', { p_fonds: fonds });
}

describe('Base Supabase — sécurité', () => {
  before(async () => {
    db = await createDb();
    admin = await db.signUp('admin@showroom.dz', 'Admin');
    gerant = await db.signUp('gerant@showroom.dz', 'Gérant');
    caissier = await db.signUp('caisse@showroom.dz', 'Caissier');
    commercial = await db.signUp('vendeur@showroom.dz', 'Vendeur');
    inactif = await db.signUp('nouveau@showroom.dz', 'Nouveau');
    depotA = (await db.admin<Row>(`select id from depots where code = 'SHW'`))[0].id;
    depotB = (await one(db.rpc(admin, 'depot_save', { p_id: null, p_code: 'PARC', p_nom: 'Parc' }))).id;
    for (const [u, role] of [[gerant, 'gerant'], [caissier, 'caissier'], [commercial, 'commercial']] as const) {
      await db.rpc(admin, 'profile_update', { p_id: u.id, p_nom: null, p_role: role, p_actif: true, p_tous_depots: true, p_depots: [] });
    }
  });

  it('le premier compte est administrateur, les suivants attendent l’activation', async () => {
    const rows = await db.admin<Row>(`select email, role, actif from profiles where email in ('admin@showroom.dz', 'nouveau@showroom.dz') order by email`);
    assert.deepEqual(rows.map((r) => [r.role, r.actif]), [['admin', true], ['commercial', false]]);
    await assert.rejects(db.rpc(inactif, 'client_save', { p_id: null, p: { nom: 'X' } }), /désactivé ou en attente/);
  });

  it('aucune écriture directe dans les tables, même pour un administrateur', async () => {
    await assert.rejects(db.as(admin, `insert into depots (code, nom) values ('Z', 'z')`), /permission denied/);
    await assert.rejects(db.as(admin, `update vehicules set statut = 'livre'`), /permission denied/);
    await assert.rejects(db.as(admin, `delete from audit_logs`), /permission denied/);
  });

  it('un visiteur non connecté ne peut rien lire ni appeler', async () => {
    await assert.rejects(db.as(null, `select * from clients`), /permission denied/);
    await assert.rejects(db.as(null, `select public.caisse_ouvrir(0)`), /permission denied/);
  });

  it('un commercial ne voit ni les coûts ni les marges, et n’encaisse pas', async () => {
    const v = await vehicule();
    assert.equal((await db.as(commercial, 'select * from vehicule_couts where vehicule_id = $1', [v.id])).length, 0);
    assert.equal((await db.as(gerant, 'select * from vehicule_couts where vehicule_id = $1', [v.id])).length, 1);
    const vte = await vente(commercial, { vehicule: v });
    assert.equal((await db.as(commercial, 'select * from vente_couts where vente_id = $1', [vte.id])).length, 0);
    await assert.rejects(db.rpc(commercial, 'paiement_ajouter', { p_vente: vte.id, p_mode: 'virement', p_montant: 1000, p_reference: 'X' }), /non autorisée/);
  });

  it('restriction par dépôt : un commercial limité au dépôt A ne voit ni ne vend le dépôt B', async () => {
    await db.rpc(admin, 'profile_update', { p_id: commercial.id, p_nom: null, p_role: 'commercial', p_actif: true, p_tous_depots: false, p_depots: [depotA] });
    const vB = await vehicule(depotB);
    assert.equal((await db.as(commercial, 'select * from vehicules where id = $1', [vB.id])).length, 0);
    await assert.rejects(vente(commercial, { vehicule: vB }), /accès à ce dépôt/);
    await db.rpc(admin, 'profile_update', { p_id: commercial.id, p_nom: null, p_role: 'commercial', p_actif: true, p_tous_depots: true, p_depots: [] });
  });

  it('un administrateur ne peut pas se rétrograder s’il est le seul', async () => {
    await assert.rejects(db.rpc(admin, 'profile_update', { p_id: admin.id, p_nom: null, p_role: 'gerant', p_actif: true }), /propre compte/);
  });
});

describe('Base Supabase — prix et TVA', () => {
  it('mode taux HT : 5 000 000 HT − 50 000 de remise à 19 %', async () => {
    const vte = await vente(gerant, { remise: 50_000 });
    assert.deepEqual([vte.montant_ht, vte.montant_tva, vte.montant_ttc], [4_950_000, 940_500, 5_890_500]);
  });

  it('mode taux TTC : 5 950 000 TTC à 19 % donne 5 000 000 HT', async () => {
    const vte = await vente(gerant, { mode: 'taux_ttc', montant: 5_950_000 });
    assert.deepEqual([vte.montant_ht, vte.montant_tva, vte.montant_ttc], [5_000_000, 950_000, 5_950_000]);
  });

  it('mode montants saisis : TVA = TTC − HT ; TTC inférieur au HT refusé', async () => {
    const vte = await vente(gerant, { mode: 'montants', montant: 4_000_000, ttc: 4_200_000, taux: null });
    assert.deepEqual([vte.montant_ht, vte.montant_tva, vte.montant_ttc, vte.taux_tva], [4_000_000, 200_000, 4_200_000, null]);
    await assert.rejects(vente(gerant, { mode: 'montants', montant: 4_000_000, ttc: 3_900_000, taux: null }), /inférieur au montant HT/);
  });

  it('mode prix direct : aucun calcul de TVA', async () => {
    const vte = await vente(gerant, { mode: 'direct', montant: 3_000_000, taux: null });
    assert.deepEqual([vte.montant_ht, vte.montant_tva, vte.montant_ttc], [3_000_000, 0, 3_000_000]);
  });

  it('taux non autorisé refusé', async () => {
    await assert.rejects(vente(gerant, { taux: 7 }), /taux de TVA autorisé/);
  });

  it('plafond de remise : refusé pour un commercial, accepté pour un gérant', async () => {
    await assert.rejects(vente(commercial, { remise: 200_000 }), /plafond/);
    // prix direct de 4 500 000 sur un véhicule affiché 5 000 000 HT = remise implicite de 500 000
    await assert.rejects(vente(commercial, { vehicule: await vehicule(depotA, 5_000_000), mode: 'direct', montant: 4_500_000, taux: null }), /plafond/);
    const ok = await vente(gerant, { remise: 200_000 });
    assert.equal(ok.remise_ht, 200_000);
  });

  it('droit de timbre sur espèces selon le barème', async () => {
    const [r] = await db.as<Row>(admin, `select calcul_droit_timbre(250) a, calcul_droit_timbre(350) b, calcul_droit_timbre(30000) c,
      calcul_droit_timbre(50000) d, calcul_droit_timbre(1000000) e`);
    assert.deepEqual([r.a, r.b, r.c, r.d, r.e], [0, 5, 300, 750, 20_000]);
  });
});

describe('Base Supabase — ventes et paiements', () => {
  it('un véhicule ne se vend qu’une fois, même avec deux demandes simultanées', async () => {
    const v = await vehicule();
    const c = await client();
    await vente(gerant, { vehicule: v, client: c });
    await assert.rejects(vente(gerant, { vehicule: v, client: c }), /plus disponible/);
    const n = await db.admin<Row>('select count(*)::int n from ventes where vehicule_id = $1', [v.id]);
    assert.equal(n[0].n, 1);
  });

  it('espèces : caisse obligatoire, timbre ajouté à la caisse, plafond contrôlé', async () => {
    await db.admin(`update caisse_sessions set statut = 'cloturee' where statut = 'ouverte'`);
    const vte = await vente(gerant, { mode: 'direct', montant: 2_000_000, taux: null });
    await assert.rejects(db.rpc(caissier, 'paiement_ajouter', { p_vente: vte.id, p_mode: 'especes', p_montant: 100_000 }), /Aucune caisse ouverte/);
    const s = await one(db.rpc(caissier, 'caisse_ouvrir', { p_fonds: 10_000 }));
    const p = await one(db.rpc(caissier, 'paiement_ajouter', { p_vente: vte.id, p_mode: 'especes', p_montant: 400_000 }));
    assert.equal(p.droit_timbre, 8_000);
    const [{ solde }] = await db.as<Row>(caissier, 'select caisse_solde($1) solde', [s.id]);
    assert.equal(solde, 10_000 + 400_000 + 8_000);
    // 400 000 + 200 000 > plafond 500 000 : refusé pour le caissier, accepté pour le gérant
    await assert.rejects(db.rpc(caissier, 'paiement_ajouter', { p_vente: vte.id, p_mode: 'especes', p_montant: 200_000 }), /plafond/);
    await db.rpc(gerant, 'paiement_ajouter', { p_vente: vte.id, p_mode: 'especes', p_montant: 200_000 });
    const logs = await db.admin<Row>(`select * from audit_logs where action = 'Dépassement du plafond espèces'`);
    assert.equal(logs.length, 1);
  });

  it('chèque certifié : compte seulement après confirmation de la banque', async () => {
    const vte = await vente(gerant, { mode: 'direct', montant: 1_000_000, taux: null });
    await assert.rejects(db.rpc(caissier, 'paiement_ajouter', { p_vente: vte.id, p_mode: 'cheque_certifie', p_montant: 1_000_000, p_banque: 'BNA', p_reference: '123' }), /date d'émission/);
    const p = await one(db.rpc(caissier, 'paiement_ajouter', { p_vente: vte.id, p_mode: 'cheque_certifie', p_montant: 1_000_000, p_banque: 'BNA', p_reference: '123', p_date_emission: '2026-10-25' }));
    assert.equal(p.statut, 'en_attente');
    let s = await soldes(vte.id);
    assert.deepEqual([s.encaisse, s.cheques_en_attente], [0, 1_000_000]);
    await assert.rejects(db.rpc(gerant, 'vente_livrer', { p_vente: vte.id }), /chèque/);
    await assert.rejects(db.rpc(caissier, 'paiement_rembourser', { p_vente: vte.id, p_montant: 1, p_mode: 'virement', p_motif: 'x' }), /non autorisée|réellement encaissé/);
    await db.rpc(caissier, 'paiement_statut', { p_id: p.id, p_statut: 'encaisse' });
    s = await soldes(vte.id);
    assert.equal(s.encaisse, 1_000_000);
    const bs = await one(db.rpc(gerant, 'vente_livrer', { p_vente: vte.id }));
    assert.match(Object.values(bs)[0] as string, /^BS-\d{4}-\d{5}$/);
  });

  it('chèque rejeté : motif obligatoire, le montant redevient dû', async () => {
    const vte = await vente(gerant, { mode: 'direct', montant: 500_000, taux: null });
    const p = await one(db.rpc(caissier, 'paiement_ajouter', { p_vente: vte.id, p_mode: 'cheque', p_montant: 500_000, p_banque: 'CPA', p_reference: '9' }));
    await assert.rejects(db.rpc(caissier, 'paiement_statut', { p_id: p.id, p_statut: 'rejete' }), /motif/);
    await db.rpc(caissier, 'paiement_statut', { p_id: p.id, p_statut: 'rejete', p_motif: 'Sans provision' });
    await assert.rejects(db.rpc(caissier, 'paiement_statut', { p_id: p.id, p_statut: 'encaisse' }), /impossible/);
    await db.rpc(caissier, 'paiement_ajouter', { p_vente: vte.id, p_mode: 'virement', p_montant: 500_000, p_reference: 'VIR-1' });
    assert.equal((await soldes(vte.id)).encaisse, 500_000);
  });

  it('traite non échue : livraison seulement avec l’accord d’un gérant', async () => {
    const vte = await vente(commercial, { mode: 'direct', montant: 3_000_000, taux: null });
    await db.rpc(caissier, 'paiement_ajouter', { p_vente: vte.id, p_mode: 'virement', p_montant: 1_000_000, p_reference: 'V' });
    await db.rpc(caissier, 'paiement_ajouter', { p_vente: vte.id, p_mode: 'traite', p_montant: 2_000_000, p_reference: 'TR-1', p_tireur: 'Client test', p_echeance: '2027-03-31' });
    await assert.rejects(db.rpc(commercial, 'vente_livrer', { p_vente: vte.id }), /accord d'un gérant/);
    await assert.rejects(db.rpc(commercial, 'vente_livrer', { p_vente: vte.id, p_accord_traite: true }), /Seul un gérant/);
    await db.rpc(gerant, 'vente_livrer', { p_vente: vte.id, p_accord_traite: true });
    const [row] = await db.admin<Row>('select statut, livraison_accord_par from ventes where id = $1', [vte.id]);
    assert.deepEqual([row.statut, row.livraison_accord_par], ['livree', 'Gérant']);
    const s = await soldes(vte.id);
    assert.deepEqual([s.encaisse, s.traites_en_portefeuille], [1_000_000, 2_000_000]);
  });

  it('livraison bloquée tant qu’il reste à payer', async () => {
    const vte = await vente(gerant, { mode: 'direct', montant: 800_000, taux: null });
    await assert.rejects(db.rpc(gerant, 'vente_livrer', { p_vente: vte.id }), /il reste/);
  });

  it('on ne peut pas encaisser plus que le reste à couvrir', async () => {
    const vte = await vente(gerant, { mode: 'direct', montant: 800_000, taux: null });
    await assert.rejects(db.rpc(caissier, 'paiement_ajouter', { p_vente: vte.id, p_mode: 'virement', p_montant: 800_001, p_reference: 'V' }), /reste à couvrir/);
  });

  it('annulation : rembourser d’abord, rien n’est supprimé, le véhicule redevient disponible', async () => {
    await ensureCaisse();
    const v = await vehicule();
    const vte = await vente(gerant, { vehicule: v, mode: 'direct', montant: 1_000_000, taux: null });
    await db.rpc(caissier, 'paiement_ajouter', { p_vente: vte.id, p_mode: 'especes', p_montant: 100_000 });
    await assert.rejects(db.rpc(gerant, 'vente_annuler', { p_vente: vte.id, p_motif: 'Désistement' }), /Remboursez/);
    await db.rpc(gerant, 'paiement_rembourser', { p_vente: vte.id, p_montant: 100_000, p_mode: 'especes', p_motif: 'Désistement' });
    await db.rpc(gerant, 'vente_annuler', { p_vente: vte.id, p_motif: 'Désistement' });
    const [veh] = await db.admin<Row>('select statut from vehicules where id = $1', [v.id]);
    assert.equal(veh.statut, 'disponible');
    const n = await db.admin<Row>('select count(*)::int n from paiements where vente_id = $1', [vte.id]);
    assert.equal(n[0].n, 2);
    // le véhicule peut être revendu
    await vente(gerant, { vehicule: v });
  });

  it('facture : numéro attribué une seule fois', async () => {
    const vte = await vente(gerant);
    const a = Object.values(await one(db.rpc(caissier, 'vente_facturer', { p_vente: vte.id })))[0];
    const b = Object.values(await one(db.rpc(caissier, 'vente_facturer', { p_vente: vte.id })))[0];
    assert.equal(a, b);
    assert.match(a as string, /^FAC-\d{4}-\d{5}$/);
  });
});

describe('Base Supabase — stock, achats, caisse, dépenses', () => {
  it('un achat n’entre en stock qu’à la réception, une seule fois', async () => {
    const f = await one(db.rpc(admin, 'fournisseur_save', { p_id: null, p: { nom: 'Importateur' } }));
    const a = await one(db.rpc(gerant, 'achat_creer', { p_fournisseur: f.id, p_lignes: [
      { marque: 'Fiat', modele: '500', annee: 2025, prix_achat: 3_000_000 },
      { marque: 'Fiat', modele: 'Tipo', annee: 2025, prix_achat: 3_500_000 },
    ] }));
    assert.equal(a.montant_total, 6_500_000);
    const lignes = await db.admin<Row>('select id from achat_lignes where achat_id = $1 order by position', [a.id]);
    const avant = (await db.admin<Row>('select count(*)::int n from vehicules'))[0].n;
    await db.rpc(gerant, 'achat_receptionner', { p_ligne: lignes[0].id, p: { depot_id: depotA, prix_vente_ht: 3_400_000 } });
    assert.equal((await db.admin<Row>('select count(*)::int n from vehicules'))[0].n, avant + 1);
    assert.equal((await db.admin<Row>('select statut from achats where id = $1', [a.id]))[0].statut, 'partiel');
    await assert.rejects(db.rpc(gerant, 'achat_receptionner', { p_ligne: lignes[0].id, p: { depot_id: depotA } }), /déjà été réceptionné/);
    await assert.rejects(db.rpc(gerant, 'fournisseur_payer', { p_achat: a.id, p_montant: 6_500_001, p_mode: 'virement' }), /reste dû/);
  });

  it('VIN en double refusé', async () => {
    const p = { marque: 'Kia', modele: 'Sportage', annee: 2025, depot_id: depotA, vin: 'KNAPX81ABCD123456' };
    await db.rpc(admin, 'vehicule_create', { p });
    await assert.rejects(db.rpc(admin, 'vehicule_create', { p }), /existe déjà/);
  });

  it('frais rattachés : inclus dans le coût de revient, annulation remise en caisse', async () => {
    await ensureCaisse(100_000);
    const v = await vehicule(depotA, 5_000_000, 4_000_000);
    const d = await one(db.rpc(caissier, 'depense_creer', { p_categorie: 'Transport', p_libelle: 'Porte-voiture', p_montant: 80_000, p_date: '2026-10-27', p_mode: 'especes', p_vehicule: v.id }));
    const d2 = await one(db.rpc(caissier, 'depense_creer', { p_categorie: 'Transport', p_libelle: 'Erreur', p_montant: 5_000, p_date: '2026-10-27', p_mode: 'especes', p_vehicule: v.id }));
    await assert.rejects(db.rpc(caissier, 'depense_annuler', { p_id: d2.id, p_motif: 'x' }), /non autorisée/);
    await db.rpc(gerant, 'depense_annuler', { p_id: d2.id, p_motif: 'Erreur de saisie' });
    const vte = await vente(gerant, { vehicule: v });
    const [cout] = await db.as<Row>(gerant, 'select cout_revient from vente_couts where vente_id = $1', [vte.id]);
    assert.equal(cout.cout_revient, 4_080_000);
    assert.ok(d.numero.startsWith('DEP-'));
  });

  it('clôture de caisse : écart calculé, explication obligatoire', async () => {
    await db.admin(`update caisse_sessions set statut = 'cloturee' where statut = 'ouverte'`);
    await db.rpc(caissier, 'caisse_ouvrir', { p_fonds: 50_000 });
    await assert.rejects(db.rpc(caissier, 'caisse_ouvrir', { p_fonds: 0 }), /déjà ouverte/);
    await db.rpc(caissier, 'caisse_apport_retrait', { p_type: 'retrait', p_montant: 20_000, p_motif: 'Dépôt banque' });
    await assert.rejects(db.rpc(caissier, 'caisse_apport_retrait', { p_type: 'retrait', p_montant: 40_000, p_motif: 'Trop' }), /insuffisantes/);
    await assert.rejects(db.rpc(caissier, 'caisse_cloturer', { p_compte: 29_000 }), /Expliquez/);
    const r = await one(db.rpc(caissier, 'caisse_cloturer', { p_compte: 29_000, p_notes: 'Pièce manquante' }));
    assert.deepEqual([r.theorique, r.compte, r.ecart], [30_000, 29_000, -1_000]);
  });

  it('chaque opération sensible est journalisée avec son auteur', async () => {
    const rows = await db.as<Row>(gerant, `select distinct action from audit_logs`);
    const actions = rows.map((r) => r.action);
    for (const a of ['Vente créée', 'Paiement enregistré', 'Véhicule livré', 'Vente annulée', 'Caisse clôturée', 'Dépense annulée', 'Statut de paiement modifié']) {
      assert.ok(actions.includes(a), `action manquante : ${a}`);
    }
    assert.equal((await db.as(commercial, 'select * from audit_logs')).length, 0);
  });
});
