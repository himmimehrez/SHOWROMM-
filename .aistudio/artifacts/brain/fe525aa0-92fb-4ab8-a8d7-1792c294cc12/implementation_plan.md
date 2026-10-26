# AutoGestion DZ — Architecture Offline-First, Sécurité & Gestion Showroom

Application web d'entreprise pour showroom automobile en Algérie, bâtie sur un socle **Offline-First rigoureux**. Ce document détaille l'ingénierie du moteur de persistance locale, la sécurité des données déconnectées, le protocole de synchronisation infaillible (zéro perte d'opération), le cycle de vie des ventes provisoires et la feuille de route progressive par jalons testables.

---

## Précisions d'Architecture Validées

> [!IMPORTANT]
> **Règles fondamentales d'ingénierie intégrées :**
> 1. **Protocole de synchronisation résilient** :
>    - Identifiant unique mondial (`UUIDv4`) + Clé d'idempotence (`deviceId` + `opId`) pour chaque transaction.
>    - Curseur serveur séquentiel strictement monotone (`server_seq`) évitant les trous ou doublons temporels.
>    - Pagination des deltas (lots de 50 enregistrements max) pour supporter les réseaux mobiles instables.
>    - Aucun nettoyage de la file d'attente locale sans acquittement explicite (`HTTP 200/201 ACK`) du serveur.
> 2. **Statut des ventes et documents hors ligne** :
>    - Toute vente conclue hors ligne est étiquetée **"Provisoire — En attente de validation centrale"**.
>    - Les documents émis hors ligne portent le filigrane et la mention légale **"DOCUMENT PROVISOIRE / HORS LIGNE"** avec numérotation de préfixe local (`PROV-SHW-T1-2026-0042`).
>    - La numérotation fiscale définitive (`FAC-2026-XXXX`, `BS-2026-XXXX`) est appliquée dès validation centrale.
> 3. **Gestion transparente des conflits sans suppression** :
>    - En cas de double affectation d'un même VIN hors ligne, la vente locale est placée en **"Conflit d'Allocation"**. Les données saisies (client, montants, acomptes perçus) sont intégralement conservées et le commercial peut réaffecter un autre véhicule équivalent en stock sans ressaisie.
> 4. **Sécurité locale & Appareils partagés** :
>    - IndexedDB n'étant pas chiffré par l'OS, les pièces d'identité (KYC) et les données sensibles sont chiffrées localement via l'API standard **Web Crypto (AES-GCM 256 bits)** avec une clé dérivée de la session active.
>    - Verrouillage automatique de session après 15 minutes d'inactivité (protection tablette showroom partagée).
>    - Déconnexion avec purge sécurisée du cache de session et conservation sélective des données opérationnelles chiffrées.
> 5. **Transfert KYC avec intégrité SHA-256** :
>    - Calcul d'empreinte SHA-256 avant envoi. Le document n'est marqué `synchronise` que lorsque le serveur confirme la réception complète et le checksum identique. Reprise automatique des transferts interrompus.

---

## 1. Architecture du Moteur Offline & Protocole de Synchronisation

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        TERMINAL LOCAL (Tablette Vendeur / PC Showroom)                 │
│                                                                                        │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │                         COUCHE INTERFACE UTILISATEUR                           │   │
│   │       FR / AR (RTL) · Badge "Hors Ligne" · Moniteur de file d'attente Sync     │   │
│   └───────────────────────┬────────────────────────────────┬───────────────────────┘   │
│                           │                                │                           │
│   ┌───────────────────────▼────────────────┐   ┌───────────▼───────────────────────┐   │
│   │     Moteur Local de Base de Données    │   │      Moteur de Synchronisation    │   │
│   │       IndexedDB (Schéma Typé)          │   │                                   │   │
│   │   • vehicules, depots, clients, ventes │   │   • Gestionnaire de file Outbox   │   │
│   │   • transactions_caisse, echeances     │   │   • Clés d'Idempotence            │   │
│   │   • documents_kyc (Chiffrement AES)    │   │   • Curseur monotone client/serveur│  │
│   │   • audit_logs locaux                  │   │   • Backoff exponentiel (retries) │   │
│   └───────────────────────▲────────────────┘   └───────────▲───────────────────────┘   │
└───────────────────────────┼────────────────────────────────┼───────────────────────────┘
                            │      RÉSEAU INTERNET           │  (Connexion rétablie)
                            │   (Coupe / Reprise auto)       │
┌───────────────────────────┼────────────────────────────────┼───────────────────────────┐
│                           ▼                                ▼                           │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │                    SERVEUR CENTRAL BACKEND (Express / Cloud)                   │   │
│   │                                                                                │   │
│   │   • POST /api/sync/push   : Traitement atomique de lot avec déduplication      │   │
│   │   • GET  /api/sync/pull   : Envoi paginé des deltas (server_seq > cursor)      │   │
│   │   • POST /api/sync/upload : Réception vérifiée SHA-256 des pièces KYC         │   │
│   │   • Arbitre de conflits transactionnels & Validateur de numéro définitif       │   │
│   └───────────────────────┬────────────────────────────────┬───────────────────────┘   │
│                           │                                │                           │
│   ┌───────────────────────▼────────────────┐   ┌───────────▼───────────────────────┐   │
│   │          Base de Données Cloud         │   │       Stockage Sécurisé Pièces    │   │
│   │          (PostgreSQL / Relational)     │   │       (Vérification Checksum)     │   │
│   └────────────────────────────────────────┘   └───────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### A. Format et États de la File d'Attente (`sync_queue`)
Chaque opération locale est insérée dans la file d'attente sous forme d'enregistrement immuable :
```typescript
interface SyncQueueItem {
  id: string; // UUIDv4 unique de l'opération
  deviceId: string; // Identifiant persistant de l'appareil
  idempotencyKey: string; // `${deviceId}_${id}`
  entityType: 'vehicule' | 'client' | 'vente' | 'caisse' | 'document';
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: any;
  createdAt: number; // Timestamp local
  status: 'pending' | 'syncing' | 'synced' | 'conflict' | 'error';
  retryCount: number;
  lastAttemptAt?: number;
  errorMessage?: string;
}
```

### B. Protocole de Push Résilient (Envoi vers le Serveur)
1. **Sélection du lot** : Le client sélectionne les `N` premières opérations à l'état `pending` ou `error` (avec temporisation de retry respectée : 2s, 4s, 8s, 16s... jusqu'à 60s max).
2. **Passage à l'état `syncing`** : Marquage local des opérations sélectionnées pour éviter tout traitement concurrent.
3. **Appel HTTP avec clé d'idempotence** : Envoi de `POST /api/sync/push` avec l'entête `X-Idempotency-Key` et le corps du lot.
4. **Acquittement serveur** :
   - Si le serveur répond `HTTP 200/201` avec la liste des `op_id` validés : le client passe ces opérations à l'état `synced` (archivées pour traçabilité ou purgées de la file active après 30 jours).
   - Si la connexion coupe avant la réception de la réponse : au prochain essai, le client renvoie le lot avec la **même clé d'idempotence**. Le serveur reconnaît les opérations déjà enregistrées et renvoie l'acquittement sans réexécuter les écritures.
   - Si le serveur signale un conflit (ex. véhicule déjà vendu) : l'opération passe à l'état `conflict` avec conservation intégrale du payload.

### C. Protocole de Pull Paginé (Réception des Mises à Jour)
1. Le client maintient un curseur local `last_server_seq` (entier strictement croissant géré par la séquence serveur).
2. Appel `GET /api/sync/pull?cursor={last_server_seq}&limit=50`.
3. Le serveur renvoie le lot de deltas ainsi que `next_cursor` et `has_more`.
4. Le client applique les modifications dans sa base IndexedDB locale et met à jour son curseur uniquement après commit local réussi. Si `has_more === true`, la page suivante est immédiatement demandée.

---

## 2. Cycle de Vie des Ventes & Documents Hors Ligne

### A. Cycle de Vente Sécurisé
```
[Saisie Vente Hors Ligne] 
        │
        ▼
[Statut Local: "provisoire_local"]
  • Véhicule marqué localement "reserve_provisoire"
  • Contrat émis avec mention "CONTRAT PROVISOIRE"
  • Reçu de caisse local "REÇU D'ACOMPTE PROVISOIRE"
        │
        ├── (Connexion rétablie -> Synchronisation Push)
        │
        ├─► [Validation Serveur Succès]
        │     • Statut passe à "confirme_central"
        │     • Attribution du numéro fiscal officiel
        │     • Déblocage de l'émission du Bon de Sortie définitif
        │
        └─► [Détection de Conflit Serveur] (Véhicule déjà vendu ailleurs)
              • Statut passe à "conflit_allocation"
              • AUCUNE donnée client ni acompte n'est supprimée
              • Notification prioritaire : "Véhicule déjà alloué. Veuillez réaffecter un véhicule."
              • Option 1 : Réaffecter un autre VIN disponible
              • Option 2 : Annuler la vente et générer un reçu de remboursement
```

### B. Gestion des Documents & Numérotation
- **Phase Hors Ligne** :
  - Identifiant provisoire clair : `CTR-PROV-[DEVICE]-[SEQ]` (ex: `CTR-PROV-T1-2026-0005`).
  - Filigrane visuel obligatoire sur l'aperçu PDF/impression : **"DOCUMENT PROVISOIRE SOUMIS À VALIDATION CENTRALE"**.
- **Phase Validée** :
  - Remplacement par le numéro chronologique légal du concessionnaire selon les règles algériennes (ex: `FAC-2026-00124`).
  - Possibilité pour le gérant de paramétrer les préfixes et mentions légales dans les réglages.

---

## 3. Sécurité Locale des Données & Protection KYC

1. **Chiffrement des Données Sensibles (Web Crypto API)** :
   - Les documents KYC (fichiers CNI, Passeport, Permis) et les informations d'identité bancaire stockées dans IndexedDB sont chiffrés en local via **AES-GCM 256 bits**.
   - La clé de session est dérivée via PBKDF2 à la connexion de l'utilisateur et conservée uniquement en mémoire vive (`sessionStorage` ou variable d'état mémoire), jamais écrite en clair dans le stockage persistant.
2. **Appareils Partagés & Déconnexion** :
   - Minuteur d'inactivité de 15 minutes avec verrouillage de l'écran par code PIN court.
   - À la déconnexion explicite : effacement immédiat de la clé de déchiffrement en mémoire. Les données restent chiffrées et illisibles jusqu'à la prochaine authentification valide.
3. **Transfert KYC avec Checksum SHA-256** :
   - Avant transmission, le client calcule le hachage SHA-256 du fichier scanné.
   - L'envoi se fait via `POST /api/sync/upload` avec en-têtes `Content-SHA256` et `X-Document-Id`.
   - Le serveur enregistre le fichier, calcule son propre hachage et renvoie l'ACK.
   - Le statut local ne passe à `synced` que si `serveur_sha256 === client_sha256`.

---

## 4. Feuille de Route & Critères de Validation du Socle (Jalon 1)

Pour garantir une implémentation robuste et vérifiable sans déclarations prématurées :

### Jalon 1 : Socle Technique Offline-First & Synchronisation (Objectif Immédiat)
- **Composants réalisés** :
  1. Base de données locale IndexedDB typée (Dexie / structure native transactionnelle) avec schémas complets.
  2. Module de chiffrement local Web Crypto AES-GCM pour les pièces jointes et données sensibles.
  3. Gestionnaire d'identité appareil (`deviceId` persistant dans `localStorage` + nom d'appareil configurable).
  4. Moteur de synchronisation client complet : file d'attente Outbox, calcul d'idempotence, détection réseau en temps réel (`navigator.onLine` + heartbeat ping), gestion des retries avec backoff exponentiel.
  5. Serveur backend Express avec endpoints de synchronisation `/api/sync/push`, `/api/sync/pull` et `/api/sync/upload`.
  6. **Tableau de bord de Synchronisation & Moniteur Réseau** dans l'UI :
     - Toggle de simulation de coupure réseau (Mode "Forcer Hors-Ligne" pour les tests).
     - Visualiseur de la file d'attente avec états (`en attente`, `en cours`, `synchronisé`, `erreur`, `conflit`).
     - Journal d'audit des synchronisations et indicateurs de latence.
  7. Système bilingue Français / Arabe avec support natif RTL et bascule instantanée.

### Critères d'Acceptation & Validation du Jalon 1 :
- [ ] **Persistance hors-ligne** : Des enregistrements créés en mode déconnecté survivent au rafraîchissement complet de la page (`F5`) sans perte d'un seul octet.
- [ ] **Détection de coupure et reprise** : La bascule en mode hors ligne déclenche instantanément la mise en file d'attente ; le rétablissement de la connexion vide la file d'attente automatiquement.
- [ ] **Idempotence certifiée** : L'envoi répété de la même opération ne génère jamais de doublon sur le serveur.
- [ ] **Chiffrement local vérifiable** : L'inspection directe des Blobs dans les outils de développement (IndexedDB inspecteur) ne permet pas de lire les images KYC en clair sans clé de session.
- [ ] **Statuts visuels clairs** : L'utilisateur voit en permanence le statut de sa connexion et le compteur d'opérations en attente.

### Jalons de Mise en Œuvre & Statuts :

- [x] **Socle Fondateur & Offline-First** : Persistance IndexedDB locale, synchronisation résiliente, file d'attente idempotente, chiffrement AES-GCM des pièces KYC, vérification d'intégrité SHA-256, gestion des conflits sans suppression, interface bilingue FR/AR (RTL).
- [x] **Étape A — Compléments Véhicules & CRM Prospects** :
  - Saisie directe du prix d'achat retenu sans ventilation requise.
  - Frais annexes détaillés et datés par véhicule (transport, préparation, réparation, formalités administratives, autres).
  - Calcul dynamique de la marge nette estimée ($\text{Marge} = \text{Prix Vente} - \text{Prix Achat Retenu} - \sum \text{Frais Annexes}$) et du taux de marge en $\%$.
  - 5 états physiques conformes : `neuf`, `occasion`, `en_preparation`, `en_reparation`, `endommage`.
  - Pipeline CRM prospects : 7 statuts (`nouveau`, `contacte`, `interesse`, `rendez_vous`, `negociation`, `converti`, `perdu`), canaux d'acquisition et journal des interactions (appels, visites, notes).
  - Intégration financière au tableau de bord (coût total du stock, marge globale estimée, indicateurs de prospection).
  - 9 tests unitaires validés avec succès (`test/offline-logic.test.ts`).
- [ ] **Étape B — Fournisseurs, Achats, Réceptions, Réservations & Essais Routiers** :
  - Répertoire des fournisseurs (concessionnaires, importateurs, prestataires) avec fiches contact et coordonnées bancaires/fiscales.
  - Commandes d'achat et bons de réception physique avec affectation au dépôt initial.
  - Module de réservations avec date d'expiration automatique et gestion des acomptes DZD.
  - Fiches d'essais routiers (permis de conduire vérifié, kilométrage départ/retour, signature client).
- [ ] **Étape C — Transferts Inter-Dépôts & Rapprochement de Parc** :
  - Workflow de transfert formalisé : `demandé` $\rightarrow$ `en transit` $\rightarrow$ `réceptionné` (double validation départ/arrivée).
  - Véhicules en transit exclus de la disponibilité vente dans le dépôt récepteur jusqu'à validation.
  - Inventaire physique de parc avec rapprochement (comptage par dépôt et détection d'écarts).
- [ ] **Étape D — Retours, Annulations, Exports Excel/CSV & Rapports Financiers** :
  - Procédures de retours véhicules et réintégrations en stock.
  - Annulations de ventes avec remboursement et traçabilité caisse.
  - Exports Excel et CSV configurables (véhicules, ventes, journal de caisse, créances).
  - Rapports de rentabilité par véhicule, marque et période.
