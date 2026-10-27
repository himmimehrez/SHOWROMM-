# Showroom Manager DZ

Application web de gestion d'un showroom automobile en Algérie : parc, achats, ventes, encaissements, caisse, dépenses et rapports. Montants en DA, dates JJ/MM/AAAA, heure d'Alger, interface en français avec navigation en arabe (RTL).

## Démarrer

```bash
npm install
cp .env.example .env.local   # puis renseigner l'URL et la clé anon public du projet Supabase
npm run dev                  # http://localhost:5173
npm test                     # règles métier, calculs, sécurité (base PostgreSQL locale)
npm run build                # version de production dans dist/
```

- **Base de données** : appliquer les migrations de `supabase/migrations` (voir `supabase/README.md`). Le premier compte créé devient administrateur ; les suivants sont activés depuis la page Utilisateurs.
- **Démonstration sans Supabase** : `VITE_BACKEND=demo npm run dev`. Les mêmes migrations tournent dans le navigateur (PGlite), avec des données fictives et des comptes de test affichés sur l'écran de connexion.

## Modules

| Module | Ce qu'il fait |
|---|---|
| Tableau de bord | CA net, encaissé, marge et résultat estimés, stock, créances, dettes, caisse, ventes par jour, alertes |
| Véhicules | Fiche, coût de revient (achat + frais), transfert entre dépôts, blocage, historique, export CSV |
| Mouvements de parc | Journal non modifiable de toutes les entrées, transferts, ventes, sorties |
| Achats et réceptions | Commandes fournisseurs ; le stock n'augmente qu'à la réception ; paiements partiels |
| Fournisseurs | Fiches et reste à payer |
| Ventes | Prix en 4 modes (HT + taux, TTC + taux, HT et TTC saisis, prix direct), remise plafonnée, paiements mixtes (espèces avec droit de timbre, virement, carte, chèque, chèque certifié, traite), remboursements, annulation tracée, livraison (soldée, ou couverte par traites avec accord gérant), contrat / facture / reçu / bon de sortie imprimables en PDF |
| Chèques et traites | Portefeuille : chèques à confirmer, traites à échéance, rejets et impayés |
| Clients et créances | Fiches, suivi prospect, échanges, reste dû |
| Caisse | Ouverture avec fonds, apports / retraits, clôture avec montant compté et écart ; seules les espèces comptent |
| Dépenses | Catégories paramétrables, rattachement à un véhicule (sans double comptage), annulation avec contre-passation |
| Rapports | Synthèse, ventes, rentabilité par véhicule, dépenses, créances et dettes, stock, écarts de caisse — CSV et PDF |
| Utilisateurs | Comptes nominatifs, 6 rôles, restriction par dépôt, activation et désactivation |
| Paramètres | Showroom, mentions des documents, remise maximale, dépôts, sauvegarde JSON |
| Journal d'audit | Connexions, ventes, encaissements, annulations, changements de prix et de droits |

## Architecture

```
supabase/migrations/   schéma, sécurité (RLS) et fonctions serveur : seul chemin d'écriture
src/lib/backend/       accès aux données : supabase.ts (réel) ou demo.ts (PGlite + mêmes migrations)
src/lib/api.ts         une fonction par opération métier (appel de fonction serveur)
src/lib/data.ts        lecture avec rafraîchissement automatique (après chaque opération, toutes les 30 s)
src/lib/fiscal.ts      aperçu instantané TVA / timbre dans les formulaires (le serveur fait foi)
src/pages/             un fichier par module
test/db/               tests de la base (règles métier et droits) + base de démonstration
docs/                  cahier des charges et décisions métier validées
```

Les droits sont appliqués **par la base** : un utilisateur qui contournerait l'interface ne peut ni lire ce que son rôle interdit (RLS), ni écrire autrement que par les fonctions serveur, qui vérifient rôle, dépôt et règles métier.

## Limites actuelles

- Pièces jointes et caméra, réservations et essais, transferts avec circuit de validation, inventaire, retours après livraison, export Excel (.xlsx), MFA et traduction arabe complète : à venir (voir le cahier des charges).
- Modèles de documents et mentions légales à faire valider par le comptable du showroom avant la mise en service.
