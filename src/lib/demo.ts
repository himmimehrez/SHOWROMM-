/**
 * Données de démonstration, chargées uniquement à la demande (Paramètres).
 * Elles passent par les mêmes services que les vraies opérations, donc restent cohérentes,
 * et sont signalées par un bandeau tant qu'elles n'ont pas été effacées.
 */
import { db } from './db';
import {
  saveDepot, saveFournisseur, createAchat, receptionnerLigne, saveClient, ouvrirCaisse, getOpenSession,
  createVente, createDepense, encaisser, payerFournisseur, audit, ValidationError,
} from './services';
import type { SessionUser } from './types';

export async function isDemoLoaded() {
  return Boolean((await db.settings.get('demo'))?.value);
}

export async function loadDemoData(user: SessionUser) {
  if (user.role !== 'admin') throw new ValidationError('Réservé à un administrateur.');
  if (await isDemoLoaded()) throw new ValidationError('Les données de démonstration sont déjà chargées.');
  if ((await db.ventes.count()) > 0) throw new ValidationError('Des ventes réelles existent : la démonstration ne peut plus être chargée.');

  const parc = await saveDepot(user, { code: 'PARC', nom: 'Parc de stockage', adresse: '', responsable: '', actif: true });
  const showroom = (await db.depots.where('code').equals('SHW').first()) ?? parc;

  const f1 = await saveFournisseur(user, { nom: '[Démo] Importateur Est Auto', telephone: '0550 00 00 01', adresse: 'Sétif' });
  const f2 = await saveFournisseur(user, { nom: '[Démo] Reprises particuliers', telephone: '', adresse: '' });

  const achat = await createAchat(user, {
    fournisseur_id: f1.id,
    notes: 'Commande de démonstration',
    lignes: [
      { marque: 'Toyota', modele: 'Hilux', finition: 'Adventure 2.8', annee: 2025, couleur: 'Blanc', vin: 'DEMO0000000000001', prix_achat: 7_200_000 },
      { marque: 'Hyundai', modele: 'Tucson', finition: 'N-Line 1.6', annee: 2025, couleur: 'Gris', vin: 'DEMO0000000000002', prix_achat: 6_300_000 },
      { marque: 'Geely', modele: 'Coolray', finition: 'Flagship', annee: 2025, couleur: 'Bleu', vin: 'DEMO0000000000003', prix_achat: 4_100_000 },
      { marque: 'Chery', modele: 'Tiggo 8 Pro', finition: '2.0 TGDI', annee: 2025, couleur: 'Noir', vin: 'DEMO0000000000004', prix_achat: 5_500_000 },
      { marque: 'Fiat', modele: 'Doblò', finition: '1.5 Hybrid', annee: 2026, couleur: 'Blanc', vin: 'DEMO0000000000005', prix_achat: 3_900_000 },
    ],
  });
  const prixVente = [8_150_000, 7_100_000, 4_680_000, 6_250_000, 4_400_000];
  const vehicules = [];
  for (let i = 0; i < 4; i++) {
    const l = achat.lignes[i];
    vehicules.push(await receptionnerLigne(user, achat.id, l.id, {
      depot_id: i % 2 === 0 ? showroom.id : parc.id, vin: '', prix_vente: prixVente[i], kilometrage: 0, etat: 'neuf',
      carburant: i === 0 ? 'diesel' : 'essence', boite: 'automatique',
    }, { demo: true }));
  }
  await payerFournisseur(user, achat.id, 20_000_000, 'virement', 'VIR-DEMO-FRN-01');
  await createAchat(user, {
    fournisseur_id: f2.id, notes: 'Reprise en attente de réception',
    lignes: [{ marque: 'Dacia', modele: 'Sandero Stepway', finition: 'TCe 90', annee: 2023, couleur: 'Vert', vin: '', prix_achat: 2_900_000 }],
  });

  const base = { type: 'particulier' as const, email: '', wilaya: '', adresse: '', piece_type: 'cni' as const, piece_numero: '', nif_rc: '', vehicule_recherche: '', notes: 'Client fictif de démonstration' };
  const c1 = await saveClient(user, { ...base, nom: '[Démo] Sofiane B.', telephone: '0550 12 34 56', wilaya: '19 - Sétif', statut: 'negociation', source: 'visite' }, { demo: true });
  await saveClient(user, { ...base, nom: '[Démo] Amine D.', telephone: '0770 45 67 89', wilaya: '06 - Béjaïa', statut: 'interesse', source: 'facebook', vehicule_recherche: 'SUV compact' }, { demo: true });
  const c3 = await saveClient(user, { ...base, type: 'entreprise', nom: '[Démo] SARL Atlas Logistique', telephone: '0661 98 76 54', wilaya: '16 - Alger', statut: 'negociation', source: 'recommandation' }, { demo: true });

  if (!(await getOpenSession())) await ouvrirCaisse(user, 200_000);

  await createDepense(user, { categorie: 'Transport', libelle: 'Porte-voiture Sétif → showroom', montant: 70_000, date: Date.now(), mode: 'especes', beneficiaire: 'Transporteur', vehicule_id: vehicules[0].id });
  await createDepense(user, { categorie: 'Préparation', libelle: 'Nettoyage et lustrage', montant: 25_000, date: Date.now(), mode: 'especes', beneficiaire: '', vehicule_id: vehicules[2].id });
  await createDepense(user, { categorie: 'Publicité', libelle: 'Campagne Facebook', montant: 15_000, date: Date.now(), mode: 'virement', beneficiaire: '', vehicule_id: '' });

  const v1 = await createVente(user, { client_id: c1.id, vehicule_id: vehicules[3].id, remise: 50_000, notes: '', acompte: { montant: 150_000, mode: 'especes', reference: '' } });
  await encaisser(user, v1.id, 2_000_000, 'cheque', 'CHQ-DEMO-0001');
  await createVente(user, { client_id: c3.id, vehicule_id: vehicules[1].id, remise: 0, notes: '', acompte: { montant: 7_100_000, mode: 'virement', reference: 'VIR-DEMO-0001' } });

  await db.settings.put({ key: 'demo', value: true });
  await audit(user, 'Données de démonstration chargées', 'données', '');
}

/** Efface toutes les données métier (comptes utilisateurs et paramètres conservés). */
export async function resetBusinessData(user: SessionUser) {
  if (user.role !== 'admin') throw new ValidationError('Réservé à un administrateur.');
  const keep = new Set(['users', 'settings', 'audit']);
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) if (!keep.has(t.name)) await t.clear();
    await db.settings.delete('demo');
  });
  await saveDepot(user, { code: 'SHW', nom: 'Showroom principal', adresse: '', responsable: user.nom, actif: true });
  await audit(user, 'Données métier effacées', 'données', '');
}
