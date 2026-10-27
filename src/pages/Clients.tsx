import React, { useEffect, useMemo, useState } from 'react';
import { Users, Plus, Download, Pencil, MessageSquarePlus } from 'lucide-react';
import { useApp } from '../app-context';
import { useTable } from '../lib/data';
import { api } from '../lib/api';
import { resteAPayer, useSoldes } from '../lib/hooks';
import { da, date, dateTime, downloadCsv, toInputDate } from '../lib/format';
import { STATUT_PROSPECT, SOURCE_PROSPECT, STATUT_VENTE, WILAYAS } from '../lib/labels';
import type { Client, Interaction, StatutProspect, Vente } from '../lib/types';
import { DataTable, type Column } from '../components/DataTable';
import { AsyncButton, Badge, Button, EmptyState, Field, Input, KeyValue, Modal, Money, PageHeader, Select, Tabs, Textarea } from '../components/ui';
import { useToast } from '../components/toast';

export type ClientInput = Pick<Client, 'type' | 'nom' | 'telephone' | 'email' | 'wilaya' | 'adresse' | 'piece_type' | 'piece_numero' | 'rc' | 'nif' | 'nis' | 'statut' | 'source' | 'vehicule_recherche' | 'notes'>;

export const EMPTY_CLIENT: ClientInput = {
  type: 'particulier', nom: '', telephone: '', email: '', wilaya: '', adresse: '', piece_type: '', piece_numero: '',
  rc: '', nif: '', nis: '', statut: 'nouveau', source: 'visite', vehicule_recherche: '', notes: '',
};

export function ClientForm({ initial, onSubmit, onCancel }: { initial: ClientInput; onSubmit: (c: ClientInput) => Promise<boolean>; onCancel: () => void }) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ClientInput>(k: K, v: ClientInput[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <form onSubmit={async (e) => { e.preventDefault(); if (busy) return; setBusy(true); try { await onSubmit(f); } finally { setBusy(false); } }} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Type">
          <Select value={f.type} onChange={(e) => set('type', e.target.value as ClientInput['type'])}>
            <option value="particulier">Particulier</option><option value="entreprise">Entreprise</option>
          </Select>
        </Field>
        <Field label={f.type === 'entreprise' ? 'Raison sociale' : 'Nom et prénom'} className="sm:col-span-2"><Input value={f.nom} onChange={(e) => set('nom', e.target.value)} required /></Field>
        <Field label="Téléphone"><Input type="tel" value={f.telephone} onChange={(e) => set('telephone', e.target.value)} placeholder="0550 12 34 56" /></Field>
        <Field label="E-mail"><Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Wilaya">
          <Select value={f.wilaya} onChange={(e) => set('wilaya', e.target.value)}>
            <option value="">—</option>
            {WILAYAS.map((w) => <option key={w}>{w}</option>)}
          </Select>
        </Field>
        <Field label="Adresse" className="sm:col-span-3" hint="Obligatoire sur la facture d'un particulier"><Input value={f.adresse} onChange={(e) => set('adresse', e.target.value)} /></Field>
        <Field label="Pièce d'identité">
          <Select value={f.piece_type} onChange={(e) => set('piece_type', e.target.value as ClientInput['piece_type'])}>
            <option value="">—</option><option value="cni">Carte d'identité</option><option value="passeport">Passeport</option><option value="permis">Permis de conduire</option>
          </Select>
        </Field>
        <Field label="N° de pièce"><Input value={f.piece_numero} onChange={(e) => set('piece_numero', e.target.value)} /></Field>
        <div className="hidden sm:block" />
        {f.type === 'entreprise' && (
          <>
            <Field label="N° RC"><Input value={f.rc} onChange={(e) => set('rc', e.target.value)} /></Field>
            <Field label="NIF"><Input value={f.nif} onChange={(e) => set('nif', e.target.value)} /></Field>
            <Field label="NIS"><Input value={f.nis} onChange={(e) => set('nis', e.target.value)} /></Field>
          </>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Suivi commercial">
          <Select value={f.statut} onChange={(e) => set('statut', e.target.value as StatutProspect)}>
            {Object.entries(STATUT_PROSPECT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>
        <Field label="Comment nous a-t-il connus ?">
          <Select value={f.source} onChange={(e) => set('source', e.target.value as ClientInput['source'])}>
            {Object.entries(SOURCE_PROSPECT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Véhicule recherché"><Input value={f.vehicule_recherche} onChange={(e) => set('vehicule_recherche', e.target.value)} /></Field>
      </div>
      <Field label="Notes"><Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={2} /></Field>
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" onClick={onCancel}>Annuler</Button>
        <Button type="submit" variant="primary" loading={busy}>Enregistrer le client</Button>
      </div>
    </form>
  );
}

function ClientDetail({ client, onClose }: { client: Client; onClose: () => void }) {
  const { can, go } = useApp();
  const toast = useToast();
  const soldes = useSoldes();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState<{ type: Interaction['type']; resume: string; prochaine_action: string } | null>(null);
  const ventes = useTable<Vente>('ventes', { eq: { client_id: client.id }, order: { column: 'date', ascending: false } }) ?? [];
  const interactions = useTable<Interaction>('interactions', { eq: { client_id: client.id }, order: { column: 'date', ascending: false } }) ?? [];
  const du = ventes.reduce((s, v) => s + Math.max(0, resteAPayer(v, soldes.get(v.id))), 0);
  const st = STATUT_PROSPECT[client.statut];

  if (editing) {
    return (
      <Modal open onClose={() => setEditing(false)} title={`Modifier ${client.nom}`} size="lg">
        <ClientForm initial={client} onCancel={() => setEditing(false)} onSubmit={async (c) => {
          const ok = await toast.run(() => api.clientSave(client.id, c), 'Client enregistré');
          if (ok) setEditing(false);
          return ok;
        }} />
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={client.nom} size="lg" footer={
      <>
        {can('clients.gerer') && <Button icon={<MessageSquarePlus className="h-4 w-4" />} onClick={() => setNote({ type: 'appel', resume: '', prochaine_action: '' })}>Noter un échange</Button>}
        {can('clients.gerer') && <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Modifier</Button>}
        {can('ventes.creer') && <Button variant="primary" onClick={() => go('ventes', { nouvelle: '1', client: client.id })}>Nouvelle vente</Button>}
      </>
    }>
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone={st.tone}>{st.label}</Badge>
        <Badge>{client.type === 'entreprise' ? 'Entreprise' : 'Particulier'}</Badge>
        {du > 0 && <Badge tone="amber">Doit {da(du)}</Badge>}
        {client.demo && <Badge tone="amber">Démonstration</Badge>}
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <KeyValue items={[
          ['Téléphone', client.telephone || '—'],
          ['E-mail', client.email || '—'],
          ['Wilaya', client.wilaya || '—'],
          ['Adresse', client.adresse || '—'],
        ]} />
        <KeyValue items={[
          ['Pièce', client.piece_numero ? `${client.piece_type.toUpperCase()} ${client.piece_numero}` : '—'],
          ...(client.type === 'entreprise' ? [['RC / NIF / NIS', [client.rc, client.nif, client.nis].filter(Boolean).join(' · ') || '—'] as [string, React.ReactNode]] : []),
          ['Source', SOURCE_PROSPECT[client.source]],
          ['Recherche', client.vehicule_recherche || '—'],
          ['Client depuis', date(client.created_at)],
        ]} />
      </div>
      {client.notes && <p className="mt-4 rounded-lg bg-surface-2 p-3 text-[13px]">{client.notes}</p>}

      <h3 className="mb-2 mt-6 font-semibold">Achats</h3>
      {ventes.length === 0 ? <p className="text-muted">Aucune vente pour ce client.</p> : (
        <table className="w-full text-[13px]"><tbody>
          {ventes.map((v) => {
            const r = resteAPayer(v, soldes.get(v.id));
            return (
              <tr key={v.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2" onClick={() => go('ventes', { open: v.id })}>
                <td className="py-2">{v.numero}</td>
                <td className="py-2">{date(v.date)}</td>
                <td className="py-2">{v.vehicule_libelle}</td>
                <td className="py-2"><Badge tone={STATUT_VENTE[v.statut].tone}>{STATUT_VENTE[v.statut].label}</Badge></td>
                <td className="py-2 text-end">{r > 0 ? <span className="text-amber">Reste {da(r)}</span> : <Money value={v.montant_ttc} />}</td>
              </tr>
            );
          })}
        </tbody></table>
      )}

      <h3 className="mb-2 mt-6 font-semibold">Échanges</h3>
      {note && (
        <div className="mb-3 grid gap-3 rounded-lg border border-line bg-surface-2 p-3 sm:grid-cols-4">
          <Field label="Type">
            <Select value={note.type} onChange={(e) => setNote({ ...note, type: e.target.value as Interaction['type'] })}>
              <option value="appel">Appel</option><option value="visite">Visite</option><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="note">Note</option>
            </Select>
          </Field>
          <Field label="Résumé" className="sm:col-span-3"><Input value={note.resume} onChange={(e) => setNote({ ...note, resume: e.target.value })} /></Field>
          <Field label="Prochaine action" className="sm:col-span-4"><Input value={note.prochaine_action} onChange={(e) => setNote({ ...note, prochaine_action: e.target.value })} placeholder="Ex. : rappeler jeudi pour l'essai" /></Field>
          <div className="flex justify-end gap-2 sm:col-span-4">
            <Button onClick={() => setNote(null)}>Annuler</Button>
            <AsyncButton variant="primary" onRun={async () => {
              if (await toast.run(() => api.interactionAdd(client.id, note.type, note.resume, note.prochaine_action), 'Échange enregistré')) setNote(null);
            }}>Enregistrer</AsyncButton>
          </div>
        </div>
      )}
      {interactions.length === 0 ? <p className="text-muted">Aucun échange noté.</p> : (
        <ol className="space-y-3">
          {interactions.map((i) => (
            <li key={i.id} className="text-[13px]">
              <div><span className="font-medium capitalize">{i.type}</span> — {i.resume}</div>
              <div className="text-muted">{dateTime(i.date)} · {i.user_nom}{i.prochaine_action ? ` · À faire : ${i.prochaine_action}` : ''}</div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

type Onglet = 'tous' | 'prospects' | 'creances';

export function ClientsPage() {
  const { can, route, go } = useApp();
  const toast = useToast();
  const clients = useTable<Client>('clients');
  const ventes = useTable<Vente>('ventes') ?? [];
  const soldes = useSoldes();
  const [onglet, setOnglet] = useState<Onglet>((route.params.onglet as Onglet) || 'tous');
  const [statut, setStatut] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => { if (route.params.onglet) setOnglet(route.params.onglet as Onglet); }, [route.params.onglet]);

  const duByClient = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of ventes) {
      const r = resteAPayer(v, soldes.get(v.id));
      if (r > 0) m.set(v.client_id, (m.get(v.client_id) ?? 0) + r);
    }
    return m;
  }, [ventes, soldes]);
  const totalDu = [...duByClient.values()].reduce((s, n) => s + n, 0);

  const rows = useMemo(() => (clients ?? []).filter((c) => {
    if (statut && c.statut !== statut) return false;
    if (onglet === 'prospects') return c.statut !== 'converti' && c.statut !== 'perdu';
    if (onglet === 'creances') return (duByClient.get(c.id) ?? 0) > 0;
    return true;
  }), [clients, onglet, statut, duByClient]);

  const opened = route.params.open ? clients?.find((c) => c.id === route.params.open) : undefined;

  const columns: Column<Client>[] = [
    { key: 'nom', header: 'Client', sortValue: (c) => c.nom, render: (c) => (
      <div><div className="font-medium">{c.nom}</div><div className="text-xs text-muted">{c.type === 'entreprise' ? 'Entreprise' : 'Particulier'}{c.wilaya ? ` · ${c.wilaya}` : ''}</div></div>
    ) },
    { key: 'tel', header: 'Téléphone', render: (c) => c.telephone || '—' },
    { key: 'statut', header: 'Suivi', sortValue: (c) => c.statut, render: (c) => <Badge tone={STATUT_PROSPECT[c.statut].tone}>{STATUT_PROSPECT[c.statut].label}</Badge> },
    { key: 'source', header: 'Source', render: (c) => SOURCE_PROSPECT[c.source], hideOnMobile: true },
    { key: 'recherche', header: 'Recherche', render: (c) => c.vehicule_recherche || '—', hideOnMobile: true },
    { key: 'du', header: 'Reste dû (TTC)', align: 'end', sortValue: (c) => duByClient.get(c.id) ?? 0, render: (c) => (duByClient.get(c.id) ?? 0) > 0 ? <Money value={duByClient.get(c.id)!} className="text-amber" strong /> : <span className="text-muted">—</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Clients et créances"
        description={totalDu > 0 ? `Total restant dû par les clients : ${da(totalDu)} TTC` : 'Fichier clients, prospects et suivi des échanges.'}
        actions={
          <>
            <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadCsv(`clients-${toInputDate(Date.now())}.csv`, [
              ['Nom', 'Type', 'Téléphone', 'E-mail', 'Wilaya', 'Suivi', 'Source', 'Recherche', 'Reste dû'],
              ...rows.map((c) => [c.nom, c.type, c.telephone, c.email, c.wilaya, STATUT_PROSPECT[c.statut].label, SOURCE_PROSPECT[c.source], c.vehicule_recherche, duByClient.get(c.id) ?? 0]),
            ])}>Exporter CSV</Button>
            {can('clients.gerer') && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Nouveau client</Button>}
          </>
        }
      />
      <div className="mb-3">
        <Tabs value={onglet} onChange={(o) => { setOnglet(o); go('clients', o === 'tous' ? {} : { onglet: o }); }} items={[
          { id: 'tous', label: 'Tous', count: clients?.length },
          { id: 'prospects', label: 'Prospects à suivre', count: clients?.filter((c) => c.statut !== 'converti' && c.statut !== 'perdu').length },
          { id: 'creances', label: 'Créances', count: duByClient.size },
        ]} />
      </div>
      <DataTable
        rows={clients ? rows : undefined}
        columns={columns}
        rowKey={(c) => c.id}
        initialSort={onglet === 'creances' ? { key: 'du', dir: 'desc' } : { key: 'nom', dir: 'asc' }}
        searchText={(c) => `${c.nom} ${c.telephone} ${c.email} ${c.wilaya} ${c.vehicule_recherche}`}
        searchPlaceholder="Nom, téléphone, wilaya…"
        onRowClick={(c) => go('clients', { ...(onglet !== 'tous' ? { onglet } : {}), open: c.id })}
        filters={
          <Select value={statut} onChange={(e) => setStatut(e.target.value)} className="w-auto" aria-label="Suivi commercial">
            <option value="">Tous les suivis</option>
            {Object.entries(STATUT_PROSPECT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        }
        empty={
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title={onglet === 'creances' ? 'Aucune créance en cours' : clients?.length ? 'Aucun client ne correspond' : 'Aucun client enregistré'}
            text={!clients?.length ? 'Ajoutez vos clients et prospects pour suivre les échanges et les ventes.' : undefined}
            action={!clients?.length && can('clients.gerer') ? <Button variant="primary" onClick={() => setCreating(true)}>Nouveau client</Button> : undefined}
          />
        }
      />
      <Modal open={creating} onClose={() => setCreating(false)} title="Nouveau client" size="lg">
        <ClientForm initial={EMPTY_CLIENT} onCancel={() => setCreating(false)} onSubmit={async (c) => {
          const ok = await toast.run(() => api.clientSave(null, c), 'Client créé');
          if (ok) setCreating(false);
          return ok;
        }} />
      </Modal>
      {opened && <ClientDetail client={opened} onClose={() => go('clients', onglet !== 'tous' ? { onglet } : {})} />}
    </div>
  );
}
