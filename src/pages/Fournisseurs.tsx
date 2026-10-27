import React, { useMemo, useState } from 'react';
import { Truck, Plus } from 'lucide-react';
import { useApp } from '../app-context';
import { useTable } from '../lib/data';
import { api } from '../lib/api';
import { da, date } from '../lib/format';
import type { Achat, Fournisseur, PaiementFournisseur } from '../lib/types';
import { DataTable, type Column } from '../components/DataTable';
import { Badge, Button, EmptyState, Field, Input, Modal, Money, PageHeader, Textarea } from '../components/ui';
import { useToast } from '../components/toast';

function FournisseurForm({ initial, onClose }: { initial?: Fournisseur; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ nom: initial?.nom ?? '', telephone: initial?.telephone ?? '', adresse: initial?.adresse ?? '', nif_rc: initial?.nif_rc ?? '', notes: initial?.notes ?? '', actif: initial?.actif ?? true });
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={initial ? `Modifier ${initial.nom}` : 'Nouveau fournisseur'} footer={
      <>
        <Button onClick={onClose}>Annuler</Button>
        <Button variant="primary" loading={busy} disabled={!f.nom.trim()} onClick={async () => {
          setBusy(true);
          const ok = await toast.run(() => api.fournisseurSave(initial?.id ?? null, f), 'Fournisseur enregistré');
          setBusy(false);
          if (ok) onClose();
        }}>Enregistrer</Button>
      </>
    }>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom ou raison sociale" className="sm:col-span-2"><Input value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /></Field>
        <Field label="Téléphone"><Input value={f.telephone} onChange={(e) => setF({ ...f, telephone: e.target.value })} /></Field>
        <Field label="NIF / RC"><Input value={f.nif_rc} onChange={(e) => setF({ ...f, nif_rc: e.target.value })} /></Field>
        <Field label="Adresse" className="sm:col-span-2"><Input value={f.adresse} onChange={(e) => setF({ ...f, adresse: e.target.value })} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} /></Field>
        {initial && <label className="flex items-center gap-2 text-[13px] sm:col-span-2"><input type="checkbox" checked={f.actif} onChange={(e) => setF({ ...f, actif: e.target.checked })} /> Fournisseur actif</label>}
      </div>
    </Modal>
  );
}

export function FournisseursPage() {
  const { go, can } = useApp();
  const fournisseurs = useTable<Fournisseur>('fournisseurs');
  const achats = useTable<Achat>(can('achats.voir') ? 'achats' : null) ?? [];
  const paiements = useTable<PaiementFournisseur>(can('achats.voir') ? 'paiements_fournisseurs' : null) ?? [];
  const [edit, setEdit] = useState<Fournisseur | 'new' | null>(null);

  const stats = useMemo(() => {
    const m = new Map<string, { achats: number; paye: number; dernier: string }>();
    const get = (id: string) => m.get(id) ?? { achats: 0, paye: 0, dernier: '' };
    for (const a of achats) {
      if (a.statut === 'annule') continue;
      const s = get(a.fournisseur_id);
      s.achats += a.montant_total;
      if (a.date > s.dernier) s.dernier = a.date;
      m.set(a.fournisseur_id, s);
    }
    for (const p of paiements) { const s = get(p.fournisseur_id); s.paye += p.montant; m.set(p.fournisseur_id, s); }
    return m;
  }, [achats, paiements]);
  const totalDu = [...stats.values()].reduce((s, x) => s + Math.max(0, x.achats - x.paye), 0);
  const du = (f: Fournisseur) => (stats.get(f.id)?.achats ?? 0) - (stats.get(f.id)?.paye ?? 0);

  const columns: Column<Fournisseur>[] = [
    { key: 'nom', header: 'Fournisseur', sortValue: (f) => f.nom, render: (f) => <div><div className="font-medium">{f.nom}</div><div className="text-xs text-muted">{f.adresse}</div></div> },
    { key: 'tel', header: 'Téléphone', render: (f) => f.telephone || '—' },
    { key: 'statut', header: 'Statut', render: (f) => f.actif ? <Badge tone="green">Actif</Badge> : <Badge>Inactif</Badge>, hideOnMobile: true },
    { key: 'dernier', header: 'Dernier achat', sortValue: (f) => stats.get(f.id)?.dernier ?? '', render: (f) => date(stats.get(f.id)?.dernier), hideOnMobile: true },
    { key: 'achats', header: 'Total commandé', align: 'end', sortValue: (f) => stats.get(f.id)?.achats ?? 0, render: (f) => <Money value={stats.get(f.id)?.achats ?? 0} /> },
    { key: 'du', header: 'Reste à payer', align: 'end', sortValue: du, render: (f) => du(f) > 0 ? <Money value={du(f)} className="text-amber" strong /> : <span className="text-muted">—</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Fournisseurs"
        description={totalDu > 0 ? `Total restant à payer aux fournisseurs : ${da(totalDu)}` : 'Importateurs, concessionnaires, particuliers (reprises) et prestataires.'}
        actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit('new')}>Nouveau fournisseur</Button>}
      />
      <DataTable
        rows={fournisseurs}
        columns={columns}
        rowKey={(f) => f.id}
        initialSort={{ key: 'nom', dir: 'asc' }}
        searchText={(f) => `${f.nom} ${f.telephone} ${f.adresse} ${f.nif_rc}`}
        onRowClick={(f) => setEdit(f)}
        filters={can('achats.voir') ? <Button size="sm" variant="ghost" onClick={() => go('achats')}>Voir les commandes</Button> : undefined}
        empty={<EmptyState icon={<Truck className="h-8 w-8" />} title="Aucun fournisseur" text="Créez vos fournisseurs avant de saisir une commande d'achat." action={<Button variant="primary" onClick={() => setEdit('new')}>Nouveau fournisseur</Button>} />}
      />
      {edit && <FournisseurForm initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
