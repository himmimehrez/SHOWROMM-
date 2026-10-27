import type { Role } from './types';

// Les permissions effectives viennent de la table role_permissions (lue au démarrage).
// L'interface s'en sert pour masquer ce qui n'est pas permis ; la base, elle, refuse de toute façon.
export type Permission =
  | 'couts.voir' | 'vehicules.gerer' | 'vehicules.prix' | 'stock.transferer' | 'stock.receptionner'
  | 'clients.gerer' | 'ventes.creer' | 'ventes.remise' | 'ventes.annuler' | 'ventes.livrer' | 'ventes.facturer'
  | 'livraison.accord' | 'paiements.encaisser' | 'paiements.valider' | 'paiements.rembourser' | 'especes.depasser'
  | 'caisse.voir' | 'caisse.operer' | 'depenses.voir' | 'depenses.gerer' | 'depenses.annuler' | 'achats.voir'
  | 'achats.gerer' | 'fournisseurs.gerer' | 'rapports.voir' | 'audit.voir' | 'utilisateurs.gerer' | 'parametres.gerer';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrateur',
  gerant: 'Gérant',
  commercial: 'Commercial',
  caissier: 'Caissier',
  agent_stock: 'Agent de stock',
  audit: 'Consultation / audit',
};

export const ROLE_HELP: Record<Role, string> = {
  admin: 'Tout, y compris les comptes et les paramètres.',
  gerant: 'Tout sauf la gestion des comptes : prix, remises, annulations, accord de livraison avec traite, achats, rapports.',
  commercial: 'Clients, création de ventes et livraisons. Ne voit ni les coûts ni les marges, n’encaisse pas.',
  caissier: 'Encaissements, chèques et traites, caisse, dépenses, factures. Ne voit ni les coûts ni les marges.',
  agent_stock: 'Véhicules, réceptions d’achats, transferts entre dépôts.',
  audit: 'Lecture seule : coûts, caisse, dépenses, rapports et journal d’audit.',
};
