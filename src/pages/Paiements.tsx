import React, { useEffect, useMemo, useState } from 'react';
import { FileCheck2, Download } from 'lucide-react';
import { useApp } from '../app-context';
import { useTable } from '../lib/data';
import { useClientsMap } from '../lib/hooks';
import { da, date, downloadCsv, MODE_LABELS, toInputDate } from '../lib/format';
import { STATUT_PAIEMENT } from '../lib/labels';
import type { Paiement, Vente } from '../lib/types';
import { DataTable, type Column } from '../components/DataTable';
import { Badge, Button, EmptyState, PageHeader, Select, StatCard } from '../components/ui';
import { StatutActions } from './Ventes';

type Filtre = 'en_attente' | 'portefeuille' | 'traites_echues' | 'incidents' | 'tous';

/** Suivi des chèques et des traites : ce qui est reçu, à confirmer, à échéance, ou en incident */
export function PaiementsPage() {
  const { route, go } = useApp();
  const clients = useClientsMap();
  const all = useTable<Paiement>('paiements');
  const ventes = useTable<Vente>('ventes');
  const venteById = useMemo(() => new Map((ventes ?? []).map((v) => [v.id, v])), [ventes]);
  const [filtre, setFiltre] = useState<Filtre>((route.params.filtre as Filtre) || 'en_attente');
  useEffect(() => { if (route.params.filtre) setFiltre(route.params.filtre as Filtre); }, [route.params.filtre]);

  const today = toInputDate(Date.now());
  const effets = useMemo(() => (all ?? []).filter((p) => p.sens === 'encaissement' && ['cheque', 'cheque_certifie', 'traite'].includes(p.mode)), [all]);
  const rows = useMemo(() => effets.filter((p) => {
    switch (filtre) {
      case 'en_attente': return p.statut === 'en_attente';
      case 'portefeuille': return p.statut === 'en_portefeuille';
      case 'traites_echues': return p.statut === 'en_portefeuille' && !!p.echeance && p.echeance <= today;
      case 'incidents': return p.statut === 'rejete' || p.statut === 'impayee';
      default: return true;
    }
  }), [effets, filtre, today]);

  const sum = (f: (p: Paiement) => boolean) => effets.filter(f).reduce((s, p) => s + p.montant, 0);
  const enAttente = sum((p) => p.statut === 'en_attente');
  const portefeuille = sum((p) => p.statut === 'en_portefeuille');
  const echues = sum((p) => p.statut === 'en_portefeuille' && !!p.echeance && p.echeance <= today);
  const incidents = sum((p) => p.statut === 'rejete' || p.statut === 'impayee');

  const columns: Column<Paiement>[] = [
    { key: 'date', header: 'Reçu le', sortValue: (p) => p.date, render: (p) => date(p.date) },
    { key: 'mode', header: 'Type', sortValue: (p) => p.mode, render: (p) => MODE_LABELS[p.mode] },
    { key: 'ref', header: 'Banque / n°', render: (p) => <span>{p.banque || '—'}<span className="block text-xs text-muted">{p.reference}</span></span> },
    { key: 'tireur', header: 'Tireur / débiteur', render: (p) => p.tireur || '—', hideOnMobile: true },
    { key: 'vente', header: 'Vente', render: (p) => {
      const v = venteById.get(p.vente_id);
      return <button className="text-start text-brand hover:underline" onClick={() => go('ventes', { open: p.vente_id })}>{v?.numero}<span className="block text-xs text-muted">{clients.get(p.client_id)?.nom}</span></button>;
    } },
    { key: 'echeance', header: 'Échéance', sortValue: (p) => p.echeance ?? '', render: (p) => p.echeance
      ? <span className={p.statut === 'en_portefeuille' && p.echeance <= today ? 'font-medium text-red' : ''}>{date(p.echeance)}</span> : '—' },
    { key: 'montant', header: 'Montant', align: 'end', sortValue: (p) => p.montant, render: (p) => <span className="whitespace-nowrap font-semibold tabular-nums">{da(p.montant)}</span> },
    { key: 'statut', header: 'Statut', sortValue: (p) => p.statut, render: (p) => <span><Badge tone={STATUT_PAIEMENT[p.statut].tone}>{STATUT_PAIEMENT[p.statut].label}</Badge>{p.motif && <span className="block text-xs text-muted">{p.motif}</span>}</span> },
    { key: 'act', header: '', align: 'end', render: (p) => <StatutActions p={p} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Chèques et traites"
        description="Un chèque compte comme encaissé après confirmation de la banque, une traite une fois payée."
        actions={<Button icon={<Download className="h-4 w-4" />} onClick={() => downloadCsv(`cheques-traites-${toInputDate(Date.now())}.csv`, [
          ['Reçu le', 'Type', 'Banque', 'Numéro', 'Tireur', 'Vente', 'Client', 'Émission', 'Échéance', 'Montant', 'Statut', 'Motif'],
          ...rows.map((p) => [date(p.date), MODE_LABELS[p.mode], p.banque, p.reference, p.tireur, venteById.get(p.vente_id)?.numero ?? '', clients.get(p.client_id)?.nom ?? '',
            date(p.date_emission), date(p.echeance), p.montant, STATUT_PAIEMENT[p.statut].label, p.motif]),
        ])}>Exporter CSV</Button>}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Chèques à confirmer" value={da(enAttente)} tone={enAttente > 0 ? 'amber' : undefined} />
        <StatCard label="Traites en portefeuille" value={da(portefeuille)} />
        <StatCard label="Traites échues non réglées" value={da(echues)} tone={echues > 0 ? 'red' : undefined} />
        <StatCard label="Rejets et impayés" value={da(incidents)} tone={incidents > 0 ? 'red' : undefined} />
      </div>
      <DataTable
        rows={all ? rows : undefined}
        columns={columns}
        rowKey={(p) => p.id}
        initialSort={filtre === 'portefeuille' || filtre === 'traites_echues' ? { key: 'echeance', dir: 'asc' } : { key: 'date', dir: 'desc' }}
        searchText={(p) => `${p.banque} ${p.reference} ${p.tireur} ${venteById.get(p.vente_id)?.numero ?? ''} ${clients.get(p.client_id)?.nom ?? ''}`}
        searchPlaceholder="Banque, numéro, tireur, client…"
        filters={
          <Select value={filtre} onChange={(e) => setFiltre(e.target.value as Filtre)} className="w-auto" aria-label="Filtrer">
            <option value="en_attente">Chèques à confirmer</option>
            <option value="portefeuille">Traites en portefeuille</option>
            <option value="traites_echues">Traites échues</option>
            <option value="incidents">Rejets et impayés</option>
            <option value="tous">Tous</option>
          </Select>
        }
        empty={<EmptyState icon={<FileCheck2 className="h-8 w-8" />} title="Rien dans cette liste" text="Les chèques et traites s'enregistrent depuis une vente, bouton « Enregistrer un paiement »." />}
      />
    </div>
  );
}
