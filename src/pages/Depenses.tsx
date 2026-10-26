import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Banknote, Plus, Download, Ban } from 'lucide-react';
import { useApp } from '../app-context';
import { db } from '../lib/db';
import { useVehiculesMap, useOpenCash } from '../lib/hooks';
import * as S from '../lib/services';
import { da, date, downloadCsv, MODE_LABELS, parseInputDate, startOfMonth, toInputDate } from '../lib/format';
import type { Depense, ModePaiement } from '../lib/types';
import { DataTable, type Column } from '../components/DataTable';
import { AsyncButton, Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal, Money, MoneyInput, PageHeader, Select, StatCard } from '../components/ui';
import { useToast } from '../components/toast';

function NouvelleDepense({ onClose }: { onClose: () => void }) {
  const { user, settings } = useApp();
  const toast = useToast();
  const cash = useOpenCash();
  const vehicules = useLiveQuery(() => db.vehicules.where('statut').notEqual('livre').toArray(), []) ?? [];
  const [f, setF] = useState({ categorie: settings.categories_depenses[0] ?? '', libelle: '', montant: 0, date: toInputDate(Date.now()), mode: 'especes' as ModePaiement, beneficiaire: '', vehicule_id: '' });
  return (
    <Modal open onClose={onClose} title="Nouvelle dépense" footer={
      <>
        <Button onClick={onClose}>Annuler</Button>
        <AsyncButton variant="primary" disabled={!f.libelle.trim() || f.montant <= 0} onRun={async () => {
          if (await toast.run(() => S.createDepense(user, { ...f, date: parseInputDate(f.date) }), 'Dépense enregistrée')) onClose();
        }}>Enregistrer la dépense</AsyncButton>
      </>
    }>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Catégorie" hint="Liste modifiable dans Paramètres">
          <Select value={f.categorie} onChange={(e) => setF({ ...f, categorie: e.target.value })}>
            {settings.categories_depenses.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Libellé" className="sm:col-span-2"><Input value={f.libelle} onChange={(e) => setF({ ...f, libelle: e.target.value })} placeholder="Ex. : facture Sonelgaz octobre" /></Field>
        <Field label="Montant"><MoneyInput value={f.montant} onChange={(n) => setF({ ...f, montant: n })} /></Field>
        <Field label="Réglé par">
          <Select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as ModePaiement })}>
            {Object.entries(MODE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Bénéficiaire"><Input value={f.beneficiaire} onChange={(e) => setF({ ...f, beneficiaire: e.target.value })} /></Field>
        <Field label="Rattacher à un véhicule" hint="Le montant s'ajoute alors à son coût de revient">
          <Select value={f.vehicule_id} onChange={(e) => setF({ ...f, vehicule_id: e.target.value })}>
            <option value="">Aucun (frais généraux)</option>
            {vehicules.map((v) => <option key={v.id} value={v.id}>{v.reference} — {v.marque} {v.modele}</option>)}
          </Select>
        </Field>
      </div>
      {f.mode === 'especes' && (cash?.session
        ? <p className="mt-3 text-[13px] text-muted">Sera retiré de la caisse ouverte (disponible : {da(cash.solde)}).</p>
        : <p className="mt-3 text-[13px] text-red">Aucune caisse ouverte : ouvrez la caisse pour une dépense en espèces, ou choisissez un autre mode.</p>)}
    </Modal>
  );
}

export function DepensesPage() {
  const { user, can, settings } = useApp();
  const toast = useToast();
  const vehicules = useVehiculesMap();
  const depenses = useLiveQuery(() => db.depenses.toArray(), []);
  const [creating, setCreating] = useState(false);
  const [cancel, setCancel] = useState<Depense | null>(null);
  const [cat, setCat] = useState('');
  const [from, setFrom] = useState(toInputDate(startOfMonth()));
  const [to, setTo] = useState('');
  const [showCancelled, setShowCancelled] = useState(false);

  const rows = useMemo(() => (depenses ?? []).filter((d) => {
    if (!showCancelled && d.annulee) return false;
    if (cat && d.categorie !== cat) return false;
    if (from && d.date < parseInputDate(from)) return false;
    if (to && d.date >= parseInputDate(to) + 86400000) return false;
    return true;
  }), [depenses, cat, from, to, showCancelled]);

  const valid = rows.filter((d) => !d.annulee);
  const total = valid.reduce((s, d) => s + d.montant, 0);
  const vehiculeTotal = valid.filter((d) => d.vehicule_id).reduce((s, d) => s + d.montant, 0);
  const especes = valid.filter((d) => d.mode === 'especes').reduce((s, d) => s + d.montant, 0);

  const columns: Column<Depense>[] = [
    { key: 'numero', header: 'N°', sortValue: (d) => d.numero, render: (d) => <span className="font-medium">{d.numero}</span> },
    { key: 'date', header: 'Date', sortValue: (d) => d.date, render: (d) => date(d.date) },
    { key: 'cat', header: 'Catégorie', sortValue: (d) => d.categorie, render: (d) => d.categorie },
    { key: 'lib', header: 'Libellé', render: (d) => (
      <div>{d.libelle}{d.vehicule_id && <div className="text-xs text-muted">Véhicule {vehicules.get(d.vehicule_id)?.reference ?? ''} {vehicules.get(d.vehicule_id)?.marque ?? ''} {vehicules.get(d.vehicule_id)?.modele ?? ''}</div>}</div>
    ) },
    { key: 'mode', header: 'Mode', render: (d) => MODE_LABELS[d.mode], hideOnMobile: true },
    { key: 'user', header: 'Saisi par', render: (d) => d.user, hideOnMobile: true },
    { key: 'montant', header: 'Montant', align: 'end', sortValue: (d) => d.montant, render: (d) => d.annulee ? <Badge tone="red">Annulée</Badge> : <Money value={d.montant} strong /> },
    ...(can('depenses.annuler') ? [{ key: 'act', header: '', align: 'end' as const, render: (d: Depense) => !d.annulee && (
      <button className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-red" onClick={(e) => { e.stopPropagation(); setCancel(d); }} aria-label={`Annuler ${d.numero}`} title="Annuler la dépense">
        <Ban className="h-4 w-4" />
      </button>
    ) }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Dépenses"
        description="Frais généraux et frais rattachés aux véhicules. Une dépense ne se supprime pas : elle s'annule avec un motif."
        actions={
          <>
            <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadCsv(`depenses-${toInputDate(Date.now())}.csv`, [
              ['N°', 'Date', 'Catégorie', 'Libellé', 'Véhicule', 'Mode', 'Bénéficiaire', 'Montant', 'Statut', 'Saisi par'],
              ...rows.map((d) => [d.numero, date(d.date), d.categorie, d.libelle, vehicules.get(d.vehicule_id)?.reference ?? '', MODE_LABELS[d.mode], d.beneficiaire, d.montant, d.annulee ? `Annulée : ${d.annulation_motif}` : 'Valide', d.user]),
            ])}>Exporter CSV</Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Nouvelle dépense</Button>
          </>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Total sur la période" value={da(total)} sub={`${valid.length} dépense(s)`} />
        <StatCard label="Dont frais rattachés aux véhicules" value={da(vehiculeTotal)} sub="Comptés dans le coût de revient, pas en charges" />
        <StatCard label="Dont réglé en espèces" value={da(especes)} />
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(d) => d.id}
        initialSort={{ key: 'date', dir: 'desc' }}
        searchText={(d) => `${d.numero} ${d.libelle} ${d.beneficiaire} ${d.categorie}`}
        filters={
          <>
            <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-auto" aria-label="Catégorie">
              <option value="">Toutes catégories</option>
              {settings.categories_depenses.map((c) => <option key={c}>{c}</option>)}
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" aria-label="Du" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" aria-label="Au" />
            <label className="flex items-center gap-1.5 text-[13px] text-muted"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Afficher les annulées</label>
          </>
        }
        empty={<EmptyState icon={<Banknote className="h-8 w-8" />} title="Aucune dépense sur cette période" action={<Button variant="primary" onClick={() => setCreating(true)}>Nouvelle dépense</Button>} />}
      />
      {creating && <NouvelleDepense onClose={() => setCreating(false)} />}
      <ConfirmDialog
        open={Boolean(cancel)}
        onClose={() => setCancel(null)}
        title={`Annuler la dépense ${cancel?.numero ?? ''}`}
        danger
        message={cancel?.mode === 'especes' ? `${da(cancel.montant)} seront remis dans la caisse ouverte.` : 'La dépense restera visible avec la mention « Annulée ».'}
        confirmLabel="Annuler la dépense"
        requireReason="Motif"
        onConfirm={async (r) => { if (cancel && await toast.run(() => S.annulerDepense(user, cancel.id, r), 'Dépense annulée')) setCancel(null); }}
      />
    </div>
  );
}
