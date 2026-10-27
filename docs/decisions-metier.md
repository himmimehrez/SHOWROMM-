# Décisions métier validées

Décisions prises par le responsable du projet le 26/10/2026. Elles s'appliquent au développement et priment sur les choix par défaut.

| # | Sujet | Décision |
|---|---|---|
| 1 | Livraison avec une traite non échue | Autorisée **avec l'accord d'un gérant**. La validation est tracée dans le journal d'audit. La traite reste suivie comme créance jusqu'à son paiement. |
| 2 | Chèque certifié | Enregistré au statut « en attente de vérification ». Il ne compte comme encaissé **qu'après confirmation de la banque** (passage au statut « encaissé »). |
| 3 | Acompte de réservation annulée | **Au cas par cas** : le gérant choisit de rembourser ou de retenir l'acompte, avec un motif obligatoire. |
| 4 | Documents de vente | Contrat, reçus et bon de sortie. **Une facture est aussi générée dans l'application**, avec un **taux de TVA choisi pour chaque vente : 0 %, 9 % ou 19 %**. |

| 5 | Prix saisis | Le prix affiché du véhicule est saisi **hors taxes (HT)**. |
| 6 | Calcul de la TVA sur une vente | **Au choix de l'utilisateur, vente par vente :**<br>**a) Par taux** : il saisit le montant HT **ou** TTC, choisit 0 %, 9 % ou 19 %, et le système calcule le reste.<br>**b) Montants saisis** : il saisit lui-même le HT et le TTC, et le système en déduit le montant de TVA (TTC − HT) et le taux effectif. Ce mode sert notamment à la TVA sur la marge d'un véhicule d'occasion. |

## Conséquences pour le calcul

- Mode « par taux », saisie HT : TVA = HT × taux, arrondie au dinar ; TTC = HT + TVA.
- Mode « par taux », saisie TTC : HT = TTC ÷ (1 + taux), arrondi au dinar ; TVA = TTC − HT.
- Mode « montants saisis » : TVA = TTC − HT. Le TTC doit être supérieur ou égal au HT, sinon la saisie est refusée.
- La remise s'applique au HT, avant le calcul de la TVA.
- **Montant dû par le client = TTC.** Les encaissements, le reste à payer, les créances et le blocage de la livraison se calculent sur le TTC.
- Le chiffre d'affaires et la marge se calculent sur le **HT** : la TVA collectée n'est pas un revenu du showroom. Elle est suivie à part dans les rapports.

## Hypothèses à confirmer

- La remise est saisie en HT.
- Les mentions légales de la facture (NIF, NIS, RC, article d'imposition, mode de règlement) sont à faire valider par le comptable du showroom.

## Règles fiscales algériennes appliquées (version initiale, à faire valider par le comptable)

Ces règles sont codées comme **paramètres modifiables** : un changement de loi de finances ne demandera pas de toucher au code.

1. **TVA** : taux choisi à chaque vente, 0 %, 9 % ou 19 % (19 % = taux normal). Arrondi au dinar.
2. **Véhicule d'occasion acheté à un particulier** : option « TVA sur la marge » (19 % appliqués à prix de vente HT − prix d'achat, selon la LF 2017). Cette règle est contestée par certains fiscalistes, donc le choix est fait vente par vente.
3. **Droit de timbre sur paiement en espèces** (Code du timbre, barème LF 2025) :
   - calculé sur le montant TTC payé en espèces, par tranche de 100 DA entamée ;
   - jusqu'à 300 DA : aucun droit ; de 301 à 30 000 DA : 1 DA par tranche ; de 30 001 à 100 000 DA : 1,50 DA par tranche ; au-delà de 100 000 DA : 2 DA par tranche ;
   - minimum 5 DA, pas de plafond ;
   - aucun droit pour les paiements par virement, carte (TPE) ou CCP ;
   - le droit figure sur une ligne à part du reçu ou de la facture.
4. **Plafond des paiements en espèces** : un seuil paramétrable (500 000 DA par défaut, selon l'art. 37 de la loi 05-01). Au-delà, l'application affiche un avertissement et demande l'accord d'un gérant. Le seuil exact applicable aux véhicules est à confirmer.
5. **Mentions de la facture** (décret exécutif 05-468) :
   - vendeur : raison sociale, forme juridique, activité, adresse, RC, NIS, NIF, article d'imposition, capital ;
   - acheteur : nom et adresse (particulier), ou raison sociale, RC, NIS et NIF (entreprise) ;
   - date et numéro d'ordre ;
   - désignation, prix unitaire HT, total HT, taux et montant de TVA, total TTC en chiffres et en lettres ;
   - mode et date de règlement ;
   - signature et cachet.
