import type { StatutVehicule, EtatVehicule, StatutVente, StatutProspect, SourceProspect, StatutAchat, TypeMouvement, TypeMvtCaisse, Carburant, Boite } from './types';

type Tone = 'neutral' | 'brand' | 'green' | 'amber' | 'red' | 'blue';

export const STATUT_VEHICULE: Record<StatutVehicule, { label: string; tone: Tone }> = {
  disponible: { label: 'Disponible', tone: 'green' },
  reserve: { label: 'Réservé', tone: 'amber' },
  vendu: { label: 'Vendu — à livrer', tone: 'blue' },
  livre: { label: 'Livré', tone: 'neutral' },
  bloque: { label: 'Bloqué', tone: 'red' },
};

export const ETAT_VEHICULE: Record<EtatVehicule, string> = {
  neuf: 'Neuf',
  occasion: 'Occasion',
  en_preparation: 'En préparation',
  en_reparation: 'En réparation',
  endommage: 'Endommagé',
};

export const CARBURANT: Record<Carburant, string> = {
  essence: 'Essence', diesel: 'Diesel', hybride: 'Hybride', electrique: 'Électrique', gpl: 'GPL',
};

export const BOITE: Record<Boite, string> = { manuelle: 'Manuelle', automatique: 'Automatique' };

export const STATUT_VENTE: Record<StatutVente, { label: string; tone: Tone }> = {
  confirmee: { label: 'Confirmée', tone: 'blue' },
  livree: { label: 'Livrée', tone: 'green' },
  annulee: { label: 'Annulée', tone: 'red' },
};

export const STATUT_PROSPECT: Record<StatutProspect, { label: string; tone: Tone }> = {
  nouveau: { label: 'Nouveau', tone: 'neutral' },
  contacte: { label: 'Contacté', tone: 'blue' },
  interesse: { label: 'Intéressé', tone: 'blue' },
  rendez_vous: { label: 'Rendez-vous', tone: 'amber' },
  negociation: { label: 'Négociation', tone: 'amber' },
  converti: { label: 'Client', tone: 'green' },
  perdu: { label: 'Perdu', tone: 'red' },
};

export const SOURCE_PROSPECT: Record<SourceProspect, string> = {
  visite: 'Visite au showroom', telephone: 'Téléphone', facebook: 'Facebook', whatsapp: 'WhatsApp',
  site_web: 'Site web', recommandation: 'Recommandation', autre: 'Autre',
};

export const STATUT_ACHAT: Record<StatutAchat, { label: string; tone: Tone }> = {
  commande: { label: 'Commandée', tone: 'amber' },
  partiel: { label: 'Partiellement reçue', tone: 'blue' },
  recu: { label: 'Reçue', tone: 'green' },
  annule: { label: 'Annulée', tone: 'red' },
};

export const TYPE_MOUVEMENT: Record<TypeMouvement, string> = {
  entree_achat: 'Entrée (achat)',
  entree_manuelle: 'Entrée manuelle',
  transfert: 'Transfert',
  vente: 'Vente',
  annulation_vente: 'Annulation de vente',
  livraison: 'Sortie (livraison)',
  blocage: 'Blocage',
  deblocage: 'Déblocage',
};

export const TYPE_MVT_CAISSE: Record<TypeMvtCaisse, string> = {
  encaissement: 'Encaissement client',
  remboursement: 'Remboursement client',
  depense: 'Dépense',
  annulation_depense: 'Annulation de dépense',
  paiement_fournisseur: 'Paiement fournisseur',
  apport: 'Apport',
  retrait: 'Retrait',
};

export const WILAYAS = [
  '01 - Adrar', '02 - Chlef', '03 - Laghouat', '04 - Oum El Bouaghi', '05 - Batna', '06 - Béjaïa', '07 - Biskra', '08 - Béchar',
  '09 - Blida', '10 - Bouira', '11 - Tamanrasset', '12 - Tébessa', '13 - Tlemcen', '14 - Tiaret', '15 - Tizi Ouzou', '16 - Alger',
  '17 - Djelfa', '18 - Jijel', '19 - Sétif', '20 - Saïda', '21 - Skikda', '22 - Sidi Bel Abbès', '23 - Annaba', '24 - Guelma',
  '25 - Constantine', '26 - Médéa', '27 - Mostaganem', "28 - M'Sila", '29 - Mascara', '30 - Ouargla', '31 - Oran', '32 - El Bayadh',
  '33 - Illizi', '34 - Bordj Bou Arréridj', '35 - Boumerdès', '36 - El Tarf', '37 - Tindouf', '38 - Tissemsilt', '39 - El Oued',
  '40 - Khenchela', '41 - Souk Ahras', '42 - Tipaza', '43 - Mila', '44 - Aïn Defla', '45 - Naâma', '46 - Aïn Témouchent',
  '47 - Ghardaïa', '48 - Relizane', '49 - Timimoun', '50 - Bordj Badji Mokhtar', '51 - Ouled Djellal', '52 - Béni Abbès',
  '53 - In Salah', '54 - In Guezzam', '55 - Touggourt', '56 - Djanet', "57 - El M'Ghair", '58 - El Meniaa',
];
