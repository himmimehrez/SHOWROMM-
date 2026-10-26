import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Receipt, Plus, Download, FileText, Printer, Truck, Ban, Undo2, Wallet } from 'lucide-react';
import { useApp } from '../app-context';
import { db } from '../lib/db';
import { useClientsMap, useVehiculesMap, useOpenCash } from '../lib/hooks';
import * as S from '../lib/services';
import { da, date, dateTime, downloadCsv, MODE_LABELS, toInputDate, startOfMonth, parseInputDate } from '../lib/format';
import { STATUT_VENTE } from '../lib/labels';
import type { Encaissement, ModePaiement, Vente } from '../lib/types';
import { DataTable, type Column } from '../components/DataTable';
import { DocumentModal, type DocKind } from '../components/Documents';
import {
  AsyncButton, Badge, Button, ConfirmDialog, EmptyState, Field, Input, KeyValue, Modal, Money, MoneyInput, PageHeader, Select, Textarea, cx,
} from '../components/ui';
import { useToast } from '../components/toast';
import { ClientForm, EMPTY_CLIENT } from './Clients';

function ModeSelect({ value, onChange, allowCash = true, id }: { value: ModePaiement; onChange: (m: ModePaiement) => void; allowCash?: boolean; id?: string }) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value as ModePaiement)}>
      {allowCash && <option value="especes">Espèces</option>}
      <option value="cheque">Chèque</option>
      <option value="virement">Virement</option>
      <option value="tpe">Carte (TPE)</option>
    </Select>
  );
}

function NouvelleVente({ onClose, presetVehicule }: { onClose: (venteId?: string) => void; presetVehicule?: string }) {
  const { user, can, settings } = useApp();
  const toast = useToast();
  const cash = useOpenCash();
  const clients = useLiveQuery(() => db.clients.orderBy('nom').toArray(), []) ?? [];
  const dispo = useLiveQuery(() => db.vehicules.where('statut').equals('disponible').toArray(), []) ?? [];
  const [clientId, setClientId] = useState('');
  const [vehiculeId, setVehiculeId] = useState(presetVehicule ?? '');
  const [remise, setRemise] = useState(0);
  const [notes, setNotes] = useState('');
  const [acompte, setAcompte] = useState(0);
  const [mode, setMode] = useState<ModePaiement>('especes');
  const [reference, setReference] = useState('');
  const [newClient, setNewClient] = useState(false);
  const [busy, setBusy] = useState(false);
  const [vq, setVq] = useState('');

  const vehicule = dispo.find((v) => v.id === vehiculeId);
  const total = vehicule ? Math.max(0, vehicule.prix_vente - remise) : 0;
  const reste = total - acompte;
  const remiseHorsPlafond = remise > settings.remise_max_commercial && !can('ventes.remise');
  const canCash = can('caisse.operer');
  const filteredDispo = dispo.filter((v) => `${v.marque} ${v.modele} ${v.finition} ${v.reference} ${v.vin}`.toLowerCase().includes(vq.toLowerCase()));

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    let created: Vente | undefined;
    const ok = await toast.run(async () => {
      created = await S.createVente(user, {
        client_id: clientId, vehicule_id: vehiculeId, remise, notes,
        acompte: acompte > 0 ? { montant: acompte, mode, reference } : undefined,
      });
    }, 'Vente enregistrée');
    setBusy(false);
    if (ok && created) onClose(created.id);
  };

  if (newClient) {
    return (
      <Modal open onClose={() => setNewClient(false)} title="Nouveau client" size="lg">
        <ClientForm
          initial={EMPTY_CLIENT}
          onCancel={() => setNewClient(false)}
          onSubmit={async (c) => {
            let id = '';
            const ok = await toast.run(async () => { id = (await S.saveClient(user, c)).id; }, 'Client créé');
            if (ok) { setClientId(id); setNewClient(false); }
            return ok;
          }}
        />
      </Modal>
    );
  }

  return (
    <Modal open onClose={() => onClose()} title="Nouvelle vente" size="xl">
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">Client</h3>
              <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setNewClient(true)}>Nouveau client</Button>
            </div>
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client">
              <option value="">Choisir un client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.telephone ? ` — ${c.telephone}` : ''}</option>)}
            </Select>
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Véhicule disponible</h3>
            <Input value={vq} onChange={(e) => setVq(e.target.value)} placeholder="Filtrer par marque, modèle, VIN…" className="mb-2" aria-label="Filtrer les véhicules" />
            <div className="max-h-64 overflow-y-auto rounded-lg border border-line">
              {filteredDispo.length === 0 && <div className="p-4 text-muted">Aucun véhicule disponible.</div>}
              {filteredDispo.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVehiculeId(v.id)}
                  className={cx('flex w-full items-center justify-between gap-3 border-b border-line px-3 py-2.5 text-start last:border-0', v.id === vehiculeId ? 'bg-brand-soft' : 'hover:bg-surface-2')}
                >
                  <span>
                    <span className="block font-medium">{v.marque} {v.modele} <span className="font-normal text-muted">{v.finition} · {v.annee}</span></span>
                    <span className="block text-xs text-muted">{v.reference}{v.vin ? ` · ${v.vin}` : ''}{v.couleur ? ` · ${v.couleur}` : ''}</span>
                  </span>
                  {v.prix_vente > 0 ? <Money value={v.prix_vente} strong /> : <Badge tone="red">Sans prix</Badge>}
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <Field label="Remise" hint={remiseHorsPlafond ? undefined : `Plafond sans autorisation : ${da(settings.remise_max_commercial)}`} error={remiseHorsPlafond ? 'Au-delà du plafond : un gérant doit enregistrer cette vente.' : undefined}>
              <MoneyInput value={remise} onChange={setRemise} />
            </Field>
            <Field label="Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Conditions particulières…" /></Field>
          </section>

          {canCash && (
            <section className="rounded-lg border border-line p-3">
              <h3 className="mb-2 font-semibold">Acompte versé maintenant <span className="font-normal text-muted">(facultatif)</span></h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Montant"><MoneyInput value={acompte} onChange={setAcompte} /></Field>
                <Field label="Mode"><ModeSelect value={mode} onChange={setMode} /></Field>
                <Field label="Référence" hint={mode === 'cheque' || mode === 'virement' ? 'Obligatoire' : undefined}><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
              </div>
              {acompte > 0 && mode === 'especes' && !cash?.session && <p className="mt-2 text-[13px] text-red">Aucune caisse ouverte : ouvrez la caisse pour encaisser en espèces.</p>}
            </section>
          )}
        </div>

        <aside className="h-fit rounded-xl bg-surface-2 p-4 lg:sticky lg:top-0">
          <h3 className="font-semibold">Récapitulatif</h3>
          {vehicule ? (
            <>
              <p className="mt-2 text-[13px]">{vehicule.marque} {vehicule.modele} {vehicule.finition}</p>
              <dl className="mt-3 space-y-1.5 text-[13px]">
                <div className="flex justify-between"><dt className="text-muted">Prix affiché</dt><dd><Money value={vehicule.prix_vente} /></dd></div>
                <div className="flex justify-between"><dt className="text-muted">Remise</dt><dd>− <Money value={remise} /></dd></div>
                <div className="flex justify-between"><dt className="text-muted">Acompte</dt><dd>− <Money value={acompte} /></dd></div>
              </dl>
              <div className="mt-3 border-t border-line pt-3">
                <div className="text-[13px] text-muted">Total à payer</div>
                <div className="text-[26px] font-semibold tracking-tight tabular-nums">{da(total)}</div>
                <div className={cx('text-[13px]', reste < 0 ? 'text-red' : 'text-muted')}>Reste après acompte : {da(reste)}</div>
              </div>
            </>
          ) : <p className="mt-2 text-[13px] text-muted">Choisissez un véhicule.</p>}
          <Button
            variant="primary"
            size="lg"
            className="mt-4 w-full"
            loading={busy}
            disabled={!clientId || !vehicule || remiseHorsPlafond || reste < 0 || remise > (vehicule?.prix_vente ?? 0)}
            onClick={submit}
          >
            Valider la vente
          </Button>
          <p className="mt-2 text-xs text-muted">Le véhicule passe en « vendu — à livrer ». Le bon de sortie ne sera possible qu'une fois le prix entièrement réglé.</p>
        </aside>
      </div>
    </Modal>
  );
}

function PaiementModal({ vente, solde, paye, kind, onClose }: { vente: Vente; solde: number; paye: number; kind: 'encaisser' | 'rembourser'; onClose: () => void }) {
  const { user } = useApp();
  const toast = useToast();
  const cash = useOpenCash();
  const [montant, setMontant] = useState(kind === 'encaisser' ? solde : 0);
  const [mode, setMode] = useState<ModePaiement>('especes');
  const [ref, setRef] = useState('');
  const max = kind === 'encaisser' ? solde : paye;
  return (
    <Modal open onClose={onClose} title={kind === 'encaisser' ? `Encaisser — ${vente.numero}` : `Rembourser — ${vente.numero}`} size="sm" footer={
      <>
        <Button onClick={onClose}>Annuler</Button>
        <AsyncButton variant={kind === 'encaisser' ? 'primary' : 'danger'} disabled={montant <= 0 || montant > max} onRun={async () => {
          const ok = kind === 'encaisser'
            ? await toast.run(() => S.encaisser(user, vente.id, montant, mode, ref), `Encaissement de ${da(montant)} enregistré`)
            : await toast.run(() => S.rembourser(user, vente.id, montant, mode, ref), `Remboursement de ${da(montant)} enregistré`);
          if (ok) onClose();
        }}>{kind === 'encaisser' ? 'Encaisser' : 'Rembourser'}</AsyncButton>
      </>
    }>
      <div className="space-y-3">
        <p className="text-[13px] text-muted">{kind === 'encaisser' ? `Reste à payer : ${da(solde)}` : `Montant encaissé à ce jour : ${da(paye)}`}</p>
        <Field label="Montant" error={montant > max ? `Maximum ${da(max)}` : undefined}><MoneyInput value={montant} onChange={setMontant} /></Field>
        <Field label="Mode"><ModeSelect value={mode} onChange={setMode} /></Field>
        <Field label={kind === 'encaisser' ? 'Référence (chèque, virement)' : 'Motif du remboursement'}><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        {mode === 'especes' && !cash?.session && <p className="text-[13px] text-red">Aucune caisse ouverte : ouvrez la caisse avant une opération en espèces.</p>}
        {mode === 'especes' && cash?.session && kind === 'rembourser' && <p className="text-[13px] text-muted">Espèces disponibles en caisse : {da(cash.solde)}</p>}
      </div>
    </Modal>
  );
}

function VenteDetail({ vente, onClose }: { vente: Vente; onClose: () => void }) {
  const { user, can, go } = useApp();
  const toast = useToast();
  const clients = useClientsMap();
  const vehicules = useVehiculesMap();
  const encs = useLiveQuery(() => db.encaissements.where('vente_id').equals(vente.id).sortBy('date'), [vente.id]) ?? [];
  const paye = S.montantPaye(vente.id, encs);
  const solde = S.soldeVente(vente, encs);
  const client = clients.get(vente.client_id);
  const vehicule = vehicules.get(vente.vehicule_id);
  const [pay, setPay] = useState<'encaisser' | 'rembourser' | null>(null);
  const [livrer, setLivrer] = useState(false);
  const [annuler, setAnnuler] = useState(false);
  const [doc, setDoc] = useState<{ kind: DocKind; enc?: Encaissement } | null>(null);
  const st = STATUT_VENTE[vente.statut];

  return (
    <Modal open onClose={onClose} title={`Vente ${vente.numero}`} size="lg" footer={
      <>
        <Button icon={<FileText className="h-4 w-4" />} onClick={() => setDoc({ kind: 'contrat' })}>Contrat</Button>
        {vente.statut === 'livree' && <Button icon={<Printer className="h-4 w-4" />} onClick={() => setDoc({ kind: 'bon_sortie' })}>Bon de sortie</Button>}
        {vente.statut === 'confirmee' && can('ventes.annuler') && <Button icon={<Ban className="h-4 w-4" />} onClick={() => setAnnuler(true)}>Annuler la vente</Button>}
        {vente.statut === 'confirmee' && paye > 0 && can('caisse.rembourser') && <Button icon={<Undo2 className="h-4 w-4" />} onClick={() => setPay('rembourser')}>Rembourser</Button>}
        {vente.statut === 'confirmee' && solde > 0 && can('caisse.operer') && <Button variant="primary" icon={<Wallet className="h-4 w-4" />} onClick={() => setPay('encaisser')}>Encaisser</Button>}
        {vente.statut === 'confirmee' && solde <= 0 && can('ventes.livrer') && <Button variant="primary" icon={<Truck className="h-4 w-4" />} onClick={() => setLivrer(true)}>Livrer et émettre le bon de sortie</Button>}
      </>
    }>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={st.tone}>{st.label}</Badge>
        {vente.statut === 'confirmee' && (solde > 0 ? <Badge tone="amber">Reste {da(solde)}</Badge> : <Badge tone="green">Soldée</Badge>)}
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <KeyValue items={[
          ['Date', dateTime(vente.date)],
          ['Client', client ? <button className="text-brand underline-offset-2 hover:underline" onClick={() => go('clients', { open: client.id })}>{client.nom}</button> : '—'],
          ['Téléphone', client?.telephone || '—'],
          ['Véhicule', vehicule ? <button className="text-start text-brand underline-offset-2 hover:underline" onClick={() => go('vehicules', { open: vehicule.id })}>{vente.vehicule_libelle}</button> : vente.vehicule_libelle],
          ['VIN', vente.vehicule_vin || '—'],
          ['Conseiller', vente.commercial],
        ]} />
        <KeyValue items={[
          ['Prix catalogue', <Money key="p" value={vente.prix_catalogue} />],
          ['Remise', <Money key="r" value={vente.remise} />],
          ['Total net', <Money key="t" value={vente.total_net} strong />],
          ['Encaissé', <Money key="e" value={paye} />],
          ['Reste à payer', <Money key="s" value={solde} strong />],
          ...(can('couts.voir') ? [['Marge estimée', <Money key="m" value={vente.total_net - vente.cout_revient} />] as [string, React.ReactNode]] : []),
        ]} />
      </div>
      {vente.statut === 'annulee' && (
        <p className="mt-4 rounded-lg bg-red-soft p-3 text-[13px] text-red">Annulée le {dateTime(vente.annulation_date)} par {vente.annulation_user} : {vente.annulation_motif}</p>
      )}
      {vente.notes && <p className="mt-4 rounded-lg bg-surface-2 p-3 text-[13px]">{vente.notes}</p>}

      <h3 className="mb-2 mt-6 font-semibold">Paiements</h3>
      {encs.length === 0 ? <p className="text-muted">Aucun paiement enregistré.</p> : (
        <table className="w-full text-[13px]">
          <tbody>
            {encs.map((e) => (
              <tr key={e.id} className="border-b border-line last:border-0">
                <td className="py-2">{dateTime(e.date)}</td>
                <td className="py-2">{e.numero}</td>
                <td className="py-2">{MODE_LABELS[e.mode]}{e.reference ? <span className="text-muted"> · {e.reference}</span> : null}</td>
                <td className="py-2 text-end">{e.type === 'remboursement' ? <span className="text-red">− {da(e.montant)}</span> : <Money value={e.montant} />}</td>
                <td className="py-2 text-end">{e.type === 'paiement' && <button className="text-brand hover:underline" onClick={() => setDoc({ kind: 'recu', enc: e })}>Reçu</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pay && <PaiementModal vente={vente} solde={solde} paye={paye} kind={pay} onClose={() => setPay(null)} />}
      {doc && <DocumentModal kind={doc.kind} vente={vente} client={client} vehicule={vehicule} encaissement={doc.enc} paye={paye} onClose={() => setDoc(null)} />}
      <ConfirmDialog
        open={livrer}
        onClose={() => setLivrer(false)}
        title="Livrer le véhicule"
        message="Le véhicule sort du parc et un bon de sortie numéroté est émis. Cette opération est définitive."
        confirmLabel="Confirmer la livraison"
        onConfirm={async () => {
          let bs = '';
          const ok = await toast.run(async () => { bs = await S.livrerVente(user, vente.id); });
          if (ok) { toast.success(`Bon de sortie ${bs} émis`); setLivrer(false); setDoc({ kind: 'bon_sortie' }); }
        }}
      />
      <ConfirmDialog
        open={annuler}
        onClose={() => setAnnuler(false)}
        title="Annuler la vente"
        danger
        message={paye > 0 ? `${da(paye)} ont été encaissés : remboursez-les d'abord, puis annulez.` : 'Le véhicule redeviendra disponible. La vente reste visible avec le statut « Annulée ».'}
        confirmLabel="Annuler la vente"
        requireReason="Motif d'annulation"
        onConfirm={async (r) => {
          if (await toast.run(() => S.annulerVente(user, vente.id, r), 'Vente annulée')) setAnnuler(false);
        }}
      />
    </Modal>
  );
}

type Filtre = 'tous' | 'confirmee' | 'a_livrer' | 'impayees' | 'livree' | 'annulee';

export function VentesPage() {
  const { can, route, go } = useApp();
  const clients = useClientsMap();
  const ventes = useLiveQuery(() => db.ventes.toArray(), []);
  const encs = useLiveQuery(() => db.encaissements.toArray(), []) ?? [];
  const [filtre, setFiltre] = useState<Filtre>((route.params.filtre as Filtre) || 'tous');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => { if (route.params.filtre) setFiltre(route.params.filtre as Filtre); }, [route.params.filtre]);

  const payeById = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of encs) m.set(e.vente_id, (m.get(e.vente_id) ?? 0) + (e.type === 'paiement' ? e.montant : -e.montant));
    return m;
  }, [encs]);

  const rows = useMemo(() => (ventes ?? []).filter((v) => {
    if (from && v.date < parseInputDate(from)) return false;
    if (to && v.date >= parseInputDate(to) + 86400000) return false;
    const reste = v.total_net - (payeById.get(v.id) ?? 0);
    switch (filtre) {
      case 'tous': return true;
      case 'a_livrer': return v.statut === 'confirmee' && reste <= 0;
      case 'impayees': return v.statut === 'confirmee' && reste > 0;
      default: return v.statut === filtre;
    }
  }), [ventes, filtre, payeById, from, to]);

  const opened = route.params.open ? ventes?.find((v) => v.id === route.params.open) : undefined;
  const closeParams = () => go('ventes', filtre !== 'tous' ? { filtre } : {});

  const columns: Column<Vente>[] = [
    { key: 'numero', header: 'N°', sortValue: (v) => v.numero, render: (v) => <span className="font-medium">{v.numero}</span> },
    { key: 'date', header: 'Date', sortValue: (v) => v.date, render: (v) => date(v.date) },
    { key: 'client', header: 'Client', sortValue: (v) => clients.get(v.client_id)?.nom ?? '', render: (v) => clients.get(v.client_id)?.nom ?? '—' },
    { key: 'veh', header: 'Véhicule', render: (v) => v.vehicule_libelle, hideOnMobile: true },
    { key: 'total', header: 'Total net', align: 'end', sortValue: (v) => v.total_net, render: (v) => <Money value={v.total_net} /> },
    { key: 'reste', header: 'Reste', align: 'end', sortValue: (v) => v.statut === 'annulee' ? 0 : v.total_net - (payeById.get(v.id) ?? 0), render: (v) => {
      if (v.statut === 'annulee') return <span className="text-muted">—</span>;
      const r = v.total_net - (payeById.get(v.id) ?? 0);
      return r > 0 ? <Money value={r} className="text-amber" /> : <span className="text-green">Soldée</span>;
    } },
    { key: 'statut', header: 'Statut', sortValue: (v) => v.statut, render: (v) => <Badge tone={STATUT_VENTE[v.statut].tone}>{STATUT_VENTE[v.statut].label}</Badge> },
  ];

  const exportCsv = () => downloadCsv(`ventes-${toInputDate(Date.now())}.csv`, [
    ['N°', 'Date', 'Client', 'Véhicule', 'VIN', 'Prix catalogue', 'Remise', 'Total net', 'Encaissé', 'Reste', 'Statut', 'Conseiller', ...(can('couts.voir') ? ['Coût de revient', 'Marge'] : [])],
    ...rows.map((v) => {
      const paye = payeById.get(v.id) ?? 0;
      return [v.numero, date(v.date), clients.get(v.client_id)?.nom ?? '', v.vehicule_libelle, v.vehicule_vin, v.prix_catalogue, v.remise, v.total_net, paye,
        v.statut === 'annulee' ? 0 : v.total_net - paye, STATUT_VENTE[v.statut].label, v.commercial,
        ...(can('couts.voir') ? [v.cout_revient, v.statut === 'annulee' ? 0 : v.total_net - v.cout_revient] : [])];
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Ventes"
        description="Contrats, paiements, livraisons et annulations."
        actions={
          <>
            <Button icon={<Download className="h-4 w-4" />} onClick={exportCsv}>Exporter CSV</Button>
            {can('ventes.creer') && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => go('ventes', { nouvelle: '1' })}>Nouvelle vente</Button>}
          </>
        }
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(v) => v.id}
        initialSort={{ key: 'date', dir: 'desc' }}
        searchText={(v) => `${v.numero} ${clients.get(v.client_id)?.nom ?? ''} ${v.vehicule_libelle} ${v.vehicule_vin}`}
        searchPlaceholder="N°, client, véhicule…"
        onRowClick={(v) => go('ventes', { ...(filtre !== 'tous' ? { filtre } : {}), open: v.id })}
        filters={
          <>
            <Select value={filtre} onChange={(e) => setFiltre(e.target.value as Filtre)} className="w-auto" aria-label="Filtrer">
              <option value="tous">Toutes les ventes</option>
              <option value="confirmee">Confirmées (non livrées)</option>
              <option value="impayees">Avec reste à payer</option>
              <option value="a_livrer">Soldées, à livrer</option>
              <option value="livree">Livrées</option>
              <option value="annulee">Annulées</option>
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" aria-label="Du" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" aria-label="Au" />
            {(from || to) && <Button size="sm" variant="ghost" onClick={() => { setFrom(''); setTo(''); }}>Effacer les dates</Button>}
            {!from && !to && <Button size="sm" variant="ghost" onClick={() => setFrom(toInputDate(startOfMonth()))}>Ce mois-ci</Button>}
          </>
        }
        empty={
          <EmptyState
            icon={<Receipt className="h-8 w-8" />}
            title={ventes?.length ? 'Aucune vente ne correspond à ces filtres' : 'Aucune vente enregistrée'}
            text={ventes?.length ? undefined : 'Créez une vente à partir d’un client et d’un véhicule disponible.'}
            action={!ventes?.length && can('ventes.creer') ? <Button variant="primary" onClick={() => go('ventes', { nouvelle: '1' })}>Nouvelle vente</Button> : undefined}
          />
        }
      />
      {route.params.nouvelle && (
        <NouvelleVente
          presetVehicule={route.params.vehicule}
          onClose={(id) => (id ? go('ventes', { open: id }) : closeParams())}
        />
      )}
      {opened && <VenteDetail vente={opened} onClose={closeParams} />}
    </div>
  );
}
