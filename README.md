# Showroom Manager DZ

Application web de gestion d'un showroom automobile en Algérie : parc, achats, ventes, encaissements, caisse, dépenses et rapports. Montants en DA, dates JJ/MM/AAAA, heure d'Alger, interface en français avec navigation en arabe (RTL).

## Démarrer

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # règles métier (vente, caisse, stock, droits)
npm run build    # version de production dans dist/
```

Au premier lancement, l'écran « Première configuration » crée le compte administrateur et le dépôt principal. Des données de démonstration peuvent être chargées depuis **Paramètres** (un bandeau les signale) et effacées au même endroit.

## Modules

| Module | Ce qu'il fait |
|---|---|
| Tableau de bord | CA net, encaissé, marge et résultat estimés, stock, créances, dettes, caisse, ventes par jour, alertes |
| Véhicules | Fiche, coût de revient (achat + frais), transfert entre dépôts, blocage, historique, export CSV |
| Mouvements de parc | Journal non modifiable de toutes les entrées, transferts, ventes, sorties |
| Achats et réceptions | Commandes fournisseurs ; le stock n'augmente qu'à la réception ; paiements partiels |
| Fournisseurs | Fiches et reste à payer |
| Ventes | Vente avec remise plafonnée, acompte, encaissements, remboursements, annulation tracée, livraison avec bon de sortie (uniquement si soldée), contrat / reçu / bon de sortie imprimables en PDF |
| Clients et créances | Fiches, suivi prospect, échanges, reste dû |
| Caisse | Ouverture avec fonds, apports / retraits, clôture avec montant compté et écart ; seules les espèces comptent |
| Dépenses | Catégories paramétrables, rattachement à un véhicule (sans double comptage), annulation avec contre-passation |
| Rapports | Synthèse, ventes, rentabilité par véhicule, dépenses, créances et dettes, stock, écarts de caisse — CSV et PDF |
| Utilisateurs | Comptes nominatifs, 4 rôles (administrateur, gérant, commercial, caissier), désactivation |
| Paramètres | Showroom, mentions des documents, remise maximale, dépôts, sauvegarde JSON |
| Journal d'audit | Connexions, ventes, encaissements, annulations, changements de prix et de droits |

## Architecture

```
src/
  lib/
    db.ts           schéma IndexedDB (Dexie)
    services.ts     TOUTES les écritures métier : droits, transactions, numérotation, audit
    auth.ts         comptes, mots de passe PBKDF2, session, déconnexion après 15 min d'inactivité
    permissions.ts  rôles et permissions
    stats.ts        définitions des indicateurs
  components/       layout, tableau, modales, documents imprimables
  pages/            un fichier par module
test/services.test.ts
docs/cahier-des-charges-showroom.txt
```

Règles respectées par `services.ts` : une opération = une transaction (tout ou rien) ; contrôles refaits dans la transaction (un double clic ne crée pas deux ventes) ; numéros séquentiels par année (`VTE-2026-00001`, `REC-`, `RMB-`, `BS-`, `ACH-`, `DEP-`, `CAI-`) ; aucune opération financière supprimée, seulement annulée avec motif.

## Limites actuelles (à traiter avec le backend)

- **Les données sont stockées dans le navigateur du poste** (IndexedDB). Elles ne sont pas partagées entre plusieurs postes et disparaissent si l'on vide les données du navigateur : téléchargez une sauvegarde régulièrement.
- Les droits sont appliqués dans la couche de services, mais côté navigateur : une personne qui a accès au poste et aux outils développeur peut contourner l'interface. Le cloisonnement réel (RLS, authentification serveur, MFA) arrive avec le backend prévu au cahier des charges.
- Les pièces d'identité scannées, les réservations / essais, l'inventaire de parc, les retours après livraison et l'import de sauvegarde ne sont pas encore faits.
- Les modèles de contrat, reçu et bon de sortie, et les mentions légales, sont à faire valider par le showroom avant la mise en service.

Le passage à un backend ne touche que `src/lib/db.ts`, `services.ts` et `auth.ts` : les pages n'écrivent jamais directement dans la base.
