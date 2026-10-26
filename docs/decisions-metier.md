# Décisions métier validées

Décisions prises par le responsable du projet le 26/10/2026. Elles s'appliquent au développement et priment sur les choix par défaut.

| # | Sujet | Décision |
|---|---|---|
| 1 | Livraison avec une traite non échue | Autorisée **avec l'accord d'un gérant**. La validation est tracée dans le journal d'audit. La traite reste suivie comme créance jusqu'à son paiement. |
| 2 | Chèque certifié | Enregistré au statut « en attente de vérification ». Il ne compte comme encaissé **qu'après confirmation de la banque** (passage au statut « encaissé »). |
| 3 | Acompte de réservation annulée | **Au cas par cas** : le gérant choisit de rembourser ou de retenir l'acompte, avec un motif obligatoire. |
| 4 | Documents de vente | Contrat, reçus et bon de sortie. **Une facture est aussi générée dans l'application**, avec un **taux de TVA choisi pour chaque vente : 0 %, 9 % ou 19 %**. |

## Hypothèse à confirmer

- Le prix de vente saisi est un prix **TTC**. La facture en déduit le HT et la TVA selon le taux choisi. Si les prix sont saisis HT, il faut le signaler.
- Les mentions légales de la facture (NIF, NIS, RC, article d'imposition, mode de règlement) sont à faire valider par le comptable du showroom.
