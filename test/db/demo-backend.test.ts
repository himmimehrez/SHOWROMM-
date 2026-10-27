// La base de démonstration (utilisée pour l'aperçu) charge les vraies migrations, et les données
// de démonstration passent par les vraies fonctions serveur : ce test vérifie le tout de bout en bout.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createDemoBackend } from '../../src/lib/backend/demo.ts';
import { seedDemo, DEMO_ACCOUNTS } from '../../src/lib/backend/seed.ts';
import type { Backend } from '../../src/lib/backend/types.ts';

const dir = join(import.meta.dirname, '../../supabase/migrations');
const migrations = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(dir, f), 'utf8'));

let b: Backend;
type Row = Record<string, any>;

describe('Base de démonstration', () => {
  before(async () => {
    b = await createDemoBackend({ migrations, seed: seedDemo });
  });

  it('les comptes de démonstration se connectent ; mauvais mot de passe refusé', async () => {
    await assert.rejects(b.signIn('admin@demo.dz', 'faux'), /incorrect/);
    await b.signIn(DEMO_ACCOUNTS[0].email, DEMO_ACCOUNTS[0].password);
    const [me] = await b.select<Row>('profiles', { eq: { id: (await b.currentUserId())! } });
    assert.equal(me.role, 'admin');
  });

  it('les données de démonstration sont cohérentes', async () => {
    await b.signIn('gerant@demo.dz', 'Demo2026!');
    const ventes = await b.select<Row>('ventes', { order: { column: 'numero' } });
    assert.equal(ventes.length, 3);
    assert.equal(typeof ventes[0].montant_ttc, 'number');
    assert.equal(ventes[0].montant_ttc, 7_199_500); // (6 100 000 − 50 000) × 1,19
    const soldes = await b.select<Row>('v_ventes_soldes', { order: { column: 'vente_id' } });
    assert.ok(soldes.some((s) => s.cheques_en_attente === 2_000_000));
    assert.ok(soldes.some((s) => s.traites_en_portefeuille === 1_600_000));
    assert.match(ventes[0].date, /^\d{4}-\d\d-\d\dT/);
  });

  it('formes de retour identiques à Supabase : ligne, valeur simple, liste, rien', async () => {
    await b.signIn('caisse@demo.dz', 'Demo2026!');
    const [v] = await b.select<Row>('ventes', { eq: { numero: 'VTE-2026-00002' } });
    const fac = await b.rpc<string>('vente_facturer', { p_vente: v.id });
    assert.match(fac, /^FAC-\d{4}-00001$/);
    const t = await b.rpc<number>('calcul_droit_timbre', { montant: 1_000_000 });
    assert.equal(t, 20_000);
    const prix = await b.rpc<Row[]>('calcul_prix', { mode: 'taux_ttc', montant: 5_950_000, taux: 19 });
    assert.deepEqual(prix[0], { montant_ht: 5_000_000, montant_tva: 950_000, montant_ttc_calc: 5_950_000, taux_tva: 19 });
    const none = await b.rpc('interaction_add', { p_client: v.client_id, p_type: 'note', p_resume: 'ok' });
    assert.equal(none, null);
  });

  it('le commercial ne voit pas les coûts et ne peut pas encaisser', async () => {
    await b.signIn('vendeur@demo.dz', 'Demo2026!');
    assert.equal((await b.select('vehicule_couts')).length, 0);
    const [v] = await b.select<Row>('ventes', { eq: { numero: 'VTE-2026-00001' } });
    await assert.rejects(b.rpc('paiement_ajouter', { p_vente: v.id, p_mode: 'virement', p_montant: 1000, p_reference: 'x' }), /non autorisée/);
  });

  it('un nouvel inscrit attend l’activation', async () => {
    await b.signUp('nouveau@demo.dz', 'Motdepasse1', 'Nouveau');
    await assert.rejects(b.rpc('client_save', { p_id: null, p: { nom: 'X' } }), /attente d'activation/);
  });
});
