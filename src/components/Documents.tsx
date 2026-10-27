import React from 'react';
import { Printer } from 'lucide-react';
import { useApp } from '../app-context';
import { da, date, dateTime, MODE_LABELS } from '../lib/format';
import { enLettres } from '../lib/lettres';
import type { Client, Paiement, Vehicule, Vente, VenteSolde } from '../lib/types';
import { Button, Modal } from './ui';

export type DocKind = 'contrat' | 'recu' | 'bon_sortie' | 'facture';

const TITLES: Record<DocKind, string> = {
  contrat: 'Contrat de vente de véhicule',
  recu: 'Reçu de paiement',
  bon_sortie: 'Bon de sortie de véhicule',
  facture: 'Facture',
};

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <tr>
      <td className="w-56 border border-black/30 px-2 py-1 font-medium">{k}</td>
      <td className="border border-black/30 px-2 py-1">{v}</td>
    </tr>
  );
}

function tvaLabel(v: Vente) {
  if (v.mode_prix === 'direct') return null;
  if (v.taux_tva !== null) return `TVA ${Number(v.taux_tva)} %`;
  return `TVA (${v.montant_ht > 0 ? ((v.montant_tva / v.montant_ht) * 100).toFixed(2).replace('.', ',') : '0'} % effectif)`;
}

/**
 * Documents imprimables (ou « Enregistrer en PDF » depuis la fenêtre d'impression).
 * Modèles et mentions légales à faire valider par le showroom avant la mise en service.
 */
export function DocumentModal({
  kind, vente, client, vehicule, paiement, paiements, solde, onClose,
}: {
  kind: DocKind; vente: Vente; client?: Client; vehicule?: Vehicule; paiement?: Paiement; paiements: Paiement[];
  solde?: VenteSolde; onClose: () => void;
}) {
  const { settings: s } = useApp();
  const encaisse = solde?.encaisse ?? 0;
  const timbre = paiements.filter((p) => p.sens === 'encaissement' && p.statut === 'confirme').reduce((t, p) => t + p.droit_timbre, 0);
  const numero = kind === 'contrat' ? vente.numero : kind === 'recu' ? paiement?.numero : kind === 'facture' ? vente.facture_numero : vente.bon_sortie_numero;
  const docDate = kind === 'recu' ? paiement?.date : kind === 'bon_sortie' ? vente.date_livraison : kind === 'facture' ? vente.facture_date : vente.date;
  const modes = [...new Set(paiements.filter((p) => p.sens === 'encaissement' && p.statut !== 'rejete' && p.statut !== 'annule').map((p) => MODE_LABELS[p.mode]))].join(', ') || 'À régler';
  const tva = tvaLabel(vente);
  const vendeur = [s.forme_juridique, s.capital && `au capital de ${s.capital}`].filter(Boolean).join(' ');

  return (
    <Modal open onClose={onClose} title={TITLES[kind]} size="lg" footer={
      <>
        <Button onClick={onClose}>Fermer</Button>
        <Button variant="primary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Imprimer ou enregistrer en PDF</Button>
      </>
    }>
      <div className="print-area rounded-lg bg-white p-6 text-[12.5px] leading-relaxed text-black">
        <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-3">
          <div>
            <div className="text-[17px] font-bold">{s.nom}</div>
            {vendeur && <div>{vendeur}</div>}
            {s.activite && <div>{s.activite}</div>}
            {s.adresse && <div>{s.adresse}</div>}
            {s.telephone && <div>Tél. : {s.telephone}{s.email ? ` · ${s.email}` : ''}</div>}
            {(s.rc || s.nif || s.nis || s.article_imposition) && (
              <div className="mt-1 text-[11px]">
                {s.rc && <>RC : {s.rc} · </>}{s.nif && <>NIF : {s.nif} · </>}{s.nis && <>NIS : {s.nis} · </>}{s.article_imposition && <>AI : {s.article_imposition}</>}
              </div>
            )}
          </div>
          <div className="text-end">
            <div className="text-[16px] font-bold uppercase">{TITLES[kind]}</div>
            <div className="mt-1">N° <strong>{numero}</strong></div>
            <div>Date : {kind === 'recu' ? dateTime(docDate) : date(docDate)}</div>
          </div>
        </header>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <section>
            <h3 className="mb-1 font-bold">{kind === 'facture' ? 'Facturé à' : 'Client'}</h3>
            <div>{client?.nom}</div>
            {client?.adresse && <div>{client.adresse}</div>}
            {client?.wilaya && <div>{client.wilaya}</div>}
            {client?.telephone && <div>Tél. : {client.telephone}</div>}
            {client?.type === 'entreprise'
              ? (client.rc || client.nif || client.nis) && <div className="text-[11px]">{client.rc && <>RC : {client.rc} · </>}{client.nif && <>NIF : {client.nif} · </>}{client.nis && <>NIS : {client.nis}</>}</div>
              : client?.piece_numero && <div>Pièce d'identité : {client.piece_type.toUpperCase()} n° {client.piece_numero}</div>}
          </section>
          <section>
            <h3 className="mb-1 font-bold">Vente</h3>
            <div>Contrat n° {vente.numero} du {date(vente.date)}</div>
            <div>Conseiller : {vente.commercial_nom}</div>
            {kind === 'facture' && <div>Mode de règlement : {modes}</div>}
          </section>
        </div>

        {kind === 'facture' ? (
          <table className="mt-4 w-full border-collapse">
            <thead>
              <tr className="bg-black/5">
                <th className="border border-black/30 px-2 py-1 text-start">Désignation</th>
                <th className="border border-black/30 px-2 py-1">Qté</th>
                <th className="border border-black/30 px-2 py-1 text-end">Prix unitaire HT</th>
                <th className="border border-black/30 px-2 py-1 text-end">Total HT</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-black/30 px-2 py-1">
                  {vente.vehicule_libelle}
                  {vente.vehicule_vin && <div className="text-[11px]">N° de châssis : {vente.vehicule_vin}</div>}
                  {vehicule?.couleur && <div className="text-[11px]">Couleur : {vehicule.couleur} · {vehicule.kilometrage.toLocaleString('fr-FR')} km</div>}
                </td>
                <td className="border border-black/30 px-2 py-1 text-center">1</td>
                <td className="border border-black/30 px-2 py-1 text-end">{da(vente.montant_ht + vente.remise_ht)}</td>
                <td className="border border-black/30 px-2 py-1 text-end">{da(vente.montant_ht + vente.remise_ht)}</td>
              </tr>
            </tbody>
            <tfoot>
              {vente.remise_ht > 0 && <tr><td colSpan={3} className="border border-black/30 px-2 py-1 text-end">Remise</td><td className="border border-black/30 px-2 py-1 text-end">− {da(vente.remise_ht)}</td></tr>}
              <tr><td colSpan={3} className="border border-black/30 px-2 py-1 text-end font-medium">Total HT</td><td className="border border-black/30 px-2 py-1 text-end">{da(vente.montant_ht)}</td></tr>
              {tva && <tr><td colSpan={3} className="border border-black/30 px-2 py-1 text-end">{tva}</td><td className="border border-black/30 px-2 py-1 text-end">{da(vente.montant_tva)}</td></tr>}
              {timbre > 0 && <tr><td colSpan={3} className="border border-black/30 px-2 py-1 text-end">Droit de timbre (paiement en espèces)</td><td className="border border-black/30 px-2 py-1 text-end">{da(timbre)}</td></tr>}
              <tr className="font-bold"><td colSpan={3} className="border border-black/30 px-2 py-1 text-end">Total TTC</td><td className="border border-black/30 px-2 py-1 text-end">{da(vente.montant_ttc + timbre)}</td></tr>
            </tfoot>
          </table>
        ) : (
          <table className="mt-4 w-full border-collapse">
            <tbody>
              <Row k="Véhicule" v={vente.vehicule_libelle} />
              <Row k="N° de châssis (VIN)" v={vente.vehicule_vin || '—'} />
              {vehicule?.immatriculation && <Row k="Immatriculation" v={vehicule.immatriculation} />}
              {vehicule && <Row k="Couleur / kilométrage" v={`${vehicule.couleur || '—'} / ${vehicule.kilometrage.toLocaleString('fr-FR')} km`} />}
              {kind === 'contrat' && (
                <>
                  <Row k="Prix HT" v={da(vente.montant_ht + vente.remise_ht)} />
                  {vente.remise_ht > 0 && <Row k="Remise" v={`− ${da(vente.remise_ht)}`} />}
                  {tva && <Row k={tva} v={da(vente.montant_tva)} />}
                  <Row k="Prix de vente TTC" v={<strong>{da(vente.montant_ttc)}</strong>} />
                  <Row k="Déjà réglé" v={da(encaisse)} />
                  <Row k="Reste à payer" v={da(vente.montant_ttc - encaisse)} />
                </>
              )}
              {kind === 'recu' && paiement && (
                <>
                  <Row k="Montant reçu" v={<strong>{da(paiement.montant)}</strong>} />
                  {paiement.droit_timbre > 0 && <Row k="Droit de timbre" v={da(paiement.droit_timbre)} />}
                  <Row k="Mode de paiement" v={`${MODE_LABELS[paiement.mode]}${paiement.banque ? ` — ${paiement.banque}` : ''}${paiement.reference ? ` — réf. ${paiement.reference}` : ''}`} />
                  {paiement.mode === 'traite' && <Row k="Échéance de la traite" v={date(paiement.echeance)} />}
                  {(paiement.mode === 'cheque' || paiement.mode === 'cheque_certifie' || paiement.mode === 'traite') && (
                    <Row k="Statut" v={paiement.mode === 'traite' ? 'Traite remise en portefeuille, réglée à l’échéance' : 'Chèque reçu, sous réserve d’encaissement'} />
                  )}
                  <Row k="Total réellement encaissé" v={da(encaisse)} />
                  <Row k="Reste à payer" v={da(vente.montant_ttc - encaisse)} />
                </>
              )}
              {kind === 'bon_sortie' && (
                <>
                  <Row k="Prix de vente TTC" v={da(vente.montant_ttc)} />
                  <Row k="Situation du paiement" v={vente.livraison_accord_par
                    ? `Solde couvert par traite(s) — livraison autorisée par ${vente.livraison_accord_par}`
                    : 'Intégralement réglé'} />
                  <Row k="Date de sortie" v={date(vente.date_livraison)} />
                </>
              )}
            </tbody>
          </table>
        )}

        {kind === 'contrat' && <p className="mt-3">Arrêté le présent contrat à la somme de : <strong>{enLettres(vente.montant_ttc)}</strong> toutes taxes comprises.</p>}
        {kind === 'facture' && <p className="mt-3">Arrêtée la présente facture à la somme de : <strong>{enLettres(vente.montant_ttc + timbre)}</strong> toutes taxes comprises.</p>}
        {kind === 'recu' && paiement && <p className="mt-3">Reçu la somme de : <strong>{enLettres(paiement.montant)}</strong>.</p>}
        {kind === 'bon_sortie' && <p className="mt-3">Le client reconnaît avoir pris possession du véhicule ci-dessus, avec ses clés et documents, en bon état apparent.</p>}

        {s.mentions && <p className="mt-4 whitespace-pre-line text-[11px]">{s.mentions}</p>}

        <div className="mt-10 grid grid-cols-2 gap-10 text-center">
          <div><div className="font-medium">Le client</div><div className="mt-14 border-t border-black/50 pt-1 text-[11px]">Signature, précédée de « lu et approuvé »</div></div>
          <div><div className="font-medium">Pour {s.nom}</div><div className="mt-14 border-t border-black/50 pt-1 text-[11px]">Signature et cachet</div></div>
        </div>
      </div>
    </Modal>
  );
}
