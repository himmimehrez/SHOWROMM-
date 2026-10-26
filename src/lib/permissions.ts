import type { Role, SessionUser } from './types';

export type Permission =
  | 'couts.voir'            // prix d'achat, coût de revient, marges
  | 'vehicules.gerer'       // créer / modifier une fiche véhicule
  | 'vehicules.prix'        // modifier un prix de vente
  | 'stock.transferer'      // transferts entre dépôts, blocage
  | 'clients.gerer'
  | 'ventes.creer'
  | 'ventes.remise'         // remise au-delà du plafond commercial
  | 'ventes.annuler'
  | 'ventes.livrer'
  | 'caisse.operer'         // ouvrir / clôturer, encaisser, apports, retraits
  | 'caisse.rembourser'
  | 'depenses.gerer'
  | 'depenses.annuler'
  | 'achats.gerer'
  | 'fournisseurs.gerer'
  | 'rapports.voir'
  | 'audit.voir'
  | 'utilisateurs.gerer'
  | 'parametres.gerer';

const ALL: Permission[] = [
  'couts.voir', 'vehicules.gerer', 'vehicules.prix', 'stock.transferer', 'clients.gerer',
  'ventes.creer', 'ventes.remise', 'ventes.annuler', 'ventes.livrer', 'caisse.operer',
  'caisse.rembourser', 'depenses.gerer', 'depenses.annuler', 'achats.gerer', 'fournisseurs.gerer',
  'rapports.voir', 'audit.voir', 'utilisateurs.gerer', 'parametres.gerer',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL,
  gerant: ALL.filter((p) => p !== 'utilisateurs.gerer'),
  commercial: ['clients.gerer', 'ventes.creer', 'ventes.livrer'],
  caissier: ['caisse.operer', 'depenses.gerer', 'clients.gerer'],
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrateur',
  gerant: 'Gérant',
  commercial: 'Commercial',
  caissier: 'Caissier',
};

export function can(user: SessionUser | null | undefined, perm: Permission): boolean {
  if (!user) return false;
  return ROLE_PERMISSIONS[user.role].includes(perm);
}

export class PermissionError extends Error {
  constructor(perm: Permission) {
    super(`Action non autorisée pour votre profil (${perm}).`);
    this.name = 'PermissionError';
  }
}

export function assertCan(user: SessionUser, perm: Permission) {
  if (!can(user, perm)) throw new PermissionError(perm);
}
