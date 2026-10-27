/** Données fictives de la base de démonstration. Elles passent par les vraies fonctions serveur. */
import type { Backend } from './types';

export const DEMO_ACCOUNTS = [
  { email: 'admin@demo.dz', password: 'Demo2026!', nom: 'Karim (admin)', role: 'admin' },
  { email: 'gerant@demo.dz', password: 'Demo2026!', nom: 'Nadia (gérante)', role: 'gerant' },
  { email: 'vendeur@demo.dz', password: 'Demo2026!', nom: 'Sofiane (commercial)', role: 'commercial' },
  { email: 'caisse@demo.dz', password: 'Demo2026!', nom: 'Amel (caisse)', role: 'caissier' },
] as const;

type Row = Record<string, any>;
const one = (r: unknown) => (Array.isArray(r) ? r[0] : r) as Row;

export async function seedDemo(b: Backend) {
  const ids: Record<string, string> = {};
  for (const a of DEMO_ACCOUNTS) {
    await b.signUp(a.email, a.password, a.nom);
    ids[a.email] = (await b.currentUserId())!;
  }
  await b.signIn(DEMO_ACCOUNTS[0].email, DEMO_ACCOUNTS[0].password);
  for (const a of DEMO_ACCOUNTS.slice(1)) {
    await b.rpc('profile_update', { p_id: ids[a.email], p_nom: a.nom, p_role: a.role, p_actif: true, p_tous_depots: true, p_depots: [] });
  }
  await b.rpc('settings_save', { p_data: {
    nom: 'Auto Prestige Sétif (démo)', adresse: 'Cité des 1000 logements, Sétif', telephone: '036 00 00 00',
    forme_juridique: 'SARL', capital: '1 000 000 DA', rc: '19/00-0000000B26', nif: '000019000000000', nis: '000019000000000',
    article_imposition: '19000000000', categories_depenses: ['Transport', 'Préparation', 'Réparation', 'Formalités', 'Loyer', 'Électricité', 'Internet', 'Publicité', 'Fournitures', 'Divers'],
  } });
  const showroom = one((await b.select<Row>('depots', { eq: { code: 'SHW' } }))[0]);
  const parc = one(await b.rpc('depot_save', { p_id: null, p_code: 'PARC', p_nom: 'Parc de stockage', p_adresse: 'Zone industrielle, Sétif', p_responsable: '', p_actif: true }));

  const f1 = one(await b.rpc('fournisseur_save', { p_id: null, p: { nom: 'Importateur Est Auto', telephone: '0550 00 00 01', adresse: 'Sétif' } }));
  const f2 = one(await b.rpc('fournisseur_save', { p_id: null, p: { nom: 'Reprises particuliers', adresse: '' } }));
  const achat = one(await b.rpc('achat_creer', { p_fournisseur: f1.id, p_notes: 'Facture IEA-2026-118', p_lignes: [
    { marque: 'Toyota', modele: 'Hilux', finition: 'Adventure 2.8', annee: 2025, couleur: 'Blanc', vin: 'DEMO0000000000001', prix_achat: 7_200_000 },
    { marque: 'Hyundai', modele: 'Tucson', finition: 'N-Line 1.6', annee: 2025, couleur: 'Gris', vin: 'DEMO0000000000002', prix_achat: 6_300_000 },
    { marque: 'Geely', modele: 'Coolray', finition: 'Flagship', annee: 2025, couleur: 'Bleu', vin: 'DEMO0000000000003', prix_achat: 4_100_000 },
    { marque: 'Chery', modele: 'Tiggo 8 Pro', finition: '2.0 TGDI', annee: 2025, couleur: 'Noir', vin: 'DEMO0000000000004', prix_achat: 5_500_000 },
    { marque: 'Fiat', modele: 'Doblò', finition: '1.5 Hybrid', annee: 2026, couleur: 'Blanc', vin: 'DEMO0000000000005', prix_achat: 3_900_000 },
  ] }));
  const lignes = await b.select<Row>('achat_lignes', { eq: { achat_id: achat.id }, order: { column: 'position' } });
  const prixHt = [7_950_000, 6_950_000, 4_550_000, 6_100_000, 4_300_000];
  const veh: Row[] = [];
  for (let i = 0; i < 4; i++) {
    veh.push(one(await b.rpc('achat_receptionner', { p_ligne: lignes[i].id, p: {
      depot_id: i % 2 === 0 ? showroom.id : parc.id, prix_vente_ht: prixHt[i], kilometrage: 0, etat: 'neuf',
      carburant: i === 0 ? 'diesel' : 'essence', boite: 'automatique', demo: true,
    } })));
  }
  await b.rpc('fournisseur_payer', { p_achat: achat.id, p_montant: 20_000_000, p_mode: 'virement', p_reference: 'VIR-BNA-55120' });
  veh.push(one(await b.rpc('vehicule_create', { p: { marque: 'Dacia', modele: 'Sandero Stepway', finition: 'TCe 90', annee: 2023, couleur: 'Vert', kilometrage: 28_000, etat: 'occasion', carburant: 'essence', boite: 'manuelle', depot_id: showroom.id, prix_vente_ht: 2_600_000, prix_achat: 2_250_000, fournisseur_id: f2.id, demo: true } })));
  veh.push(one(await b.rpc('vehicule_create', { p: { marque: 'Renault', modele: 'Clio 5', finition: 'Evolution', annee: 2024, couleur: 'Rouge', kilometrage: 12_500, etat: 'en_preparation', carburant: 'essence', boite: 'manuelle', depot_id: parc.id, prix_vente_ht: 2_900_000, prix_achat: 2_500_000, demo: true } })));

  const base = { type: 'particulier', piece_type: 'cni', notes: 'Client fictif (démonstration)', demo: true };
  const c1 = one(await b.rpc('client_save', { p_id: null, p: { ...base, nom: 'Sofiane Belkacem', telephone: '0550 12 34 56', wilaya: '19 - Sétif', adresse: 'Cité El Hidhab, Sétif', piece_numero: '109845231012', statut: 'negociation', source: 'visite' } }));
  const c2 = one(await b.rpc('client_save', { p_id: null, p: { ...base, nom: 'Amine Djebbar', telephone: '0770 45 67 89', wilaya: '06 - Béjaïa', statut: 'interesse', source: 'facebook', vehicule_recherche: 'SUV compact' } }));
  const c3 = one(await b.rpc('client_save', { p_id: null, p: { ...base, type: 'entreprise', nom: 'SARL Atlas Logistique', telephone: '0661 98 76 54', wilaya: '16 - Alger', rc: '16/00-1284598B21', nif: '002116012845963', statut: 'negociation', source: 'recommandation' } }));
  await b.rpc('interaction_add', { p_client: c2.id, p_type: 'appel', p_resume: 'Intéressé par le Coolray, demande un essai.', p_prochaine_action: 'Rappeler jeudi pour fixer l’essai' });

  await b.rpc('caisse_ouvrir', { p_fonds: 200_000 });
  await b.rpc('depense_creer', { p_categorie: 'Transport', p_libelle: 'Porte-voiture port → showroom', p_montant: 70_000, p_date: new Date().toISOString().slice(0, 10), p_mode: 'especes', p_beneficiaire: 'Transports Benali', p_vehicule: veh[0].id });
  await b.rpc('depense_creer', { p_categorie: 'Publicité', p_libelle: 'Campagne Facebook octobre', p_montant: 15_000, p_date: new Date().toISOString().slice(0, 10), p_mode: 'virement', p_beneficiaire: '', p_vehicule: null });

  // Vente 1 : prix HT + TVA 19 %, remise, acompte espèces + chèque certifié en attente
  const v1 = one(await b.rpc('vente_create', { p_client: c1.id, p_vehicule: veh[3].id, p_mode_prix: 'taux_ht', p_montant: 6_100_000, p_taux: 19, p_remise: 50_000, p_notes: '' }));
  await b.rpc('paiement_ajouter', { p_vente: v1.id, p_mode: 'especes', p_montant: 150_000 });
  await b.rpc('paiement_ajouter', { p_vente: v1.id, p_mode: 'cheque_certifie', p_montant: 2_000_000, p_banque: 'BNA', p_reference: 'CC-448812', p_date_emission: new Date().toISOString().slice(0, 10) });
  // Vente 2 : entreprise, payée par virement, prête à livrer
  const v2 = one(await b.rpc('vente_create', { p_client: c3.id, p_vehicule: veh[1].id, p_mode_prix: 'taux_ht', p_montant: 6_950_000, p_taux: 19, p_remise: 0, p_notes: '' }));
  await b.rpc('paiement_ajouter', { p_vente: v2.id, p_mode: 'virement', p_montant: v2.montant_ttc, p_reference: 'VIR-CPA-90231' });
  // Vente 3 : véhicule d'occasion, prix direct, virement + traite à 6 mois
  const v3 = one(await b.rpc('vente_create', { p_client: c2.id, p_vehicule: veh[4].id, p_mode_prix: 'direct', p_montant: 2_600_000, p_notes: 'Reprise à prix ferme' }));
  await b.rpc('paiement_ajouter', { p_vente: v3.id, p_mode: 'virement', p_montant: 1_000_000, p_reference: 'VIR-BDL-11873' });
  const ech = new Date(); ech.setMonth(ech.getMonth() + 6);
  await b.rpc('paiement_ajouter', { p_vente: v3.id, p_mode: 'traite', p_montant: 1_600_000, p_reference: 'TR-2026-031', p_tireur: 'Amine Djebbar', p_echeance: ech.toISOString().slice(0, 10) });
}
