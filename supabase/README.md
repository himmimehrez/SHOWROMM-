# Base de données Supabase

Deux migrations, à appliquer dans l'ordre :

1. `migrations/20261027080000_schema.sql` : tables, rôles et permissions, sécurité par ligne (RLS), vue des soldes.
2. `migrations/20261027080100_fonctions.sql` : fonctions serveur, seul chemin d'écriture (ventes, TVA, paiements, caisse, achats, dépenses…).

## Appliquer sur ton projet

**Option simple (sans rien installer)** : dans le tableau de bord Supabase, ouvre **SQL Editor → New query**, colle le contenu du fichier 1, clique sur **Run**, puis recommence avec le fichier 2.

**Option ligne de commande** : `npx supabase link --project-ref <ref>`, puis `npx supabase db push`.

Ensuite, dans **Authentication → Sign In / Providers**, garde **Email** activé. Le **premier compte créé** devient automatiquement administrateur. Les comptes suivants restent en attente jusqu'à leur activation par un administrateur (page Utilisateurs).

## Règles de sécurité

- Les utilisateurs connectés peuvent **lire** selon leur rôle et leurs dépôts. **Aucune écriture directe** n'est possible sur les tables, même pour un administrateur.
- Toute modification passe par une fonction serveur, qui vérifie le compte actif, la permission et le dépôt. Elle verrouille les lignes concernées, refait les contrôles métier, numérote et journalise. Une erreur annule tout.
- Prix d'achat et coût de revient : tables séparées (`vehicule_couts`, `vente_couts`), lisibles seulement avec la permission `couts.voir`.
- Les règles fiscales (taux de TVA, barème du droit de timbre, plafond espèces, remise maximale) sont dans `settings` et se modifient sans toucher au code.
- La clé `service_role` n'est **jamais** utilisée par l'application.

## Tests

`npm run test:db` charge les deux migrations dans un PostgreSQL local (PGlite) qui imite Supabase. Il vérifie les règles métier, les calculs et les droits appliqués par la base : 27 scénarios.
