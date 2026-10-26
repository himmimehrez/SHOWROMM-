import React from 'react';
import { Printer } from 'lucide-react';
import { useApp } from '../app-context';
import { da, date, dateTime, MODE_LABELS } from '../lib/format';
import { enLettres } from '../lib/lettres';
import type { Client, Encaissement, Vehicule, Vente } from '../lib/types';
import { Button, Modal } from './ui';

export type DocKind = 'contrat' | 'recu' | 'bon_sortie';

const TITLES: Record<DocKind, string> = {
  contrat: 'Contrat de vente de véhicule',
  recu: 'Reçu de paiement',
  bon_sortie: 'Bon de sortie de véhicule',
};

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <tr>
      <td className="w-48 border border-black/30 px-2 py-1 font-medium">{k}</td>
      <td className="border border-black/30 px-2 py-1">{v}</td>
    </tr>
  );
}

/**
 * Documents imprimables (ou « Enregistrer en PDF » depuis la fenêtre d'impression).
 * Modèles à faire valider par le showroom avant mise en service, notamment les mentions légales.
 */
export function DocumentModal({
  kind, vente, client, vehicule, encaissement, paye, onClose,
}: {
  kind: DocKind; vente: Vente; client?: Client; vehicule?: Vehicule; encaissement?: Encaissement; paye: number; onClose: () => void;
}) {
  const { settings } = useApp();
  const numero = kind === 'contrat' ? vente.numero : kind === 'recu' ? encaissement?.numero : vente.bon_sortie_numero;
  const docDate = kind === 'recu' ? encaissement?.date : kind === 'bon_sortie' ? vente.date_livraison : vente.date;

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
            <div className="text-[17px] font-bold">{settings.nom}</div>
            {settings.adresse && <div>{settings.adresse}</div>}
            {settings.telephone && <div>Tél. : {settings.telephone}</div>}
            {settings.nif_rc && <div>{settings.nif_rc}</div>}
          </div>
          <div className="text-end">
            <div className="text-[16px] font-bold uppercase">{TITLES[kind]}</div>
            <div className="mt-1">N° <strong>{numero}</strong></div>
            <div>Date : {kind === 'recu' ? dateTime(docDate) : date(docDate)}</div>
          </div>
        </header>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <section>
            <h3 className="mb-1 font-bold">Client</h3>
            <div>{client?.nom}</div>
            {client?.adresse && <div>{client.adresse}</div>}
            {client?.wilaya && <div>{client.wilaya}</div>}
            {client?.telephone && <div>Tél. : {client.telephone}</div>}
            {client?.piece_numero && <div>Pièce d'identité : {client.piece_type.toUpperCase()} n° {client.piece_numero}</div>}
            {client?.nif_rc && <div>{client.nif_rc}</div>}
          </section>
          <section>
            <h3 className="mb-1 font-bold">Vente</h3>
            <div>Contrat n° {vente.numero} du {date(vente.date)}</div>
            <div>Conseiller : {vente.commercial}</div>
          </section>
        </div>

        <table className="mt-4 w-full border-collapse">
          <tbody>
            <Row k="Véhicule" v={vente.vehicule_libelle} />
            <Row k="N° de châssis (VIN)" v={vente.vehicule_vin || '—'} />
            {vehicule?.immatriculation && <Row k="Immatriculation" v={vehicule.immatriculation} />}
            {vehicule && <Row k="Couleur / kilométrage" v={`${vehicule.couleur || '—'} / ${vehicule.kilometrage.toLocaleString('fr-FR')} km`} />}
            {kind === 'contrat' && (
              <>
                <Row k="Prix catalogue" v={da(vente.prix_catalogue)} />
                {vente.remise > 0 && <Row k="Remise" v={`− ${da(vente.remise)}`} />}
                <Row k="Prix de vente net" v={<strong>{da(vente.total_net)}</strong>} />
                <Row k="Montant déjà réglé" v={da(paye)} />
                <Row k="Reste à payer" v={da(vente.total_net - paye)} />
              </>
            )}
            {kind === 'recu' && encaissement && (
              <>
                <Row k="Montant reçu" v={<strong>{da(encaissement.montant)}</strong>} />
                <Row k="Mode de paiement" v={`${MODE_LABELS[encaissement.mode]}${encaissement.reference ? ` — réf. ${encaissement.reference}` : ''}`} />
                <Row k="Total réglé à ce jour" v={da(paye)} />
                <Row k="Reste à payer" v={da(vente.total_net - paye)} />
              </>
            )}
            {kind === 'bon_sortie' && (
              <>
                <Row k="Prix de vente net" v={da(vente.total_net)} />
                <Row k="Situation du paiement" v="Intégralement réglé" />
                <Row k="Date de sortie" v={date(vente.date_livraison)} />
              </>
            )}
          </tbody>
        </table>

        {kind === 'contrat' && <p className="mt-3">Arrêté le présent contrat à la somme de : <strong>{enLettres(vente.total_net)}</strong>.</p>}
        {kind === 'recu' && encaissement && <p className="mt-3">Reçu la somme de : <strong>{enLettres(encaissement.montant)}</strong>.</p>}
        {kind === 'bon_sortie' && <p className="mt-3">Le client reconnaît avoir pris possession du véhicule ci-dessus, avec ses clés et documents, en bon état apparent.</p>}

        {settings.mentions && <p className="mt-4 whitespace-pre-line text-[11px]">{settings.mentions}</p>}

        <div className="mt-10 grid grid-cols-2 gap-10 text-center">
          <div><div className="font-medium">Le client</div><div className="mt-14 border-t border-black/50 pt-1 text-[11px]">Signature, précédée de « lu et approuvé »</div></div>
          <div><div className="font-medium">Pour {settings.nom}</div><div className="mt-14 border-t border-black/50 pt-1 text-[11px]">Signature et cachet</div></div>
        </div>
      </div>
    </Modal>
  );
}
