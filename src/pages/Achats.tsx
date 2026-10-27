import React, { useMemo, useState } from 'react';
import { PackageCheck, Plus, Trash2, Ban, Wallet } from 'lucide-react';
import { useApp } from '../app-context';
import { useTable } from '../lib/data';
import { api } from '../lib/api';
import { useDepots, useFournisseursMap, useOpenCash } from '../lib/hooks';
import { da, date, dateTime, downloadCsv, MODE_LABELS, toInputDate } from '../lib/format';
import { STATUT_ACHAT, ETAT_VEHICULE, CARBURANT, BOITE } from '../lib/labels';
import type { Achat, AchatLigne, Fournisseur, PaiementFournisseur, Vehicule } from '../lib/types';
import { DataTable, type Column } from '../components/DataTable';
import { AsyncButton, Badge, Button, ConfirmDialog, EmptyState, Field, Input, KeyValue, Modal, Money, MoneyInput, PageHeader, Select } from '../components/ui';
import { useToast } from '../components/toast';

const year = new Date().getFullYear();
type LigneInput = { marque: string; modele: string; finition: string; annee: number; couleur: string; vin: string; prix_achat: number };
const emptyLine = (): LigneInput => ({ marque: '', modele: '', finition: '', annee: year, couleur: '', vin: '', prix_achat: 0 });

function NouvelAchat({ onClose }: { onClose: () => void }) {
  const { go } = useApp();
  const toast = useToast();
  const fournisseurs = (useTable<Fournisseur>('fournisseurs') ?? []).filter((f) => f.actif);
  const [fid, setFid] = useState('');
  const [notes, setNotes] = useState('');
  const [lignes, setLignes] = useState<LigneInput[]>([emptyLine()]);
  const setL = (i: number, patch: Partial<LigneInput>) => setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = lignes.reduce((s, l) => s + (l.prix_achat || 0), 0);

  return (
    <Modal open onClose={onClose} title="Nouvelle commande d'achat" size="xl" footer={
      <>
        <span className="me-auto self-center text-[13px] text-muted">Total : <strong className="text-ink">{da(total)}</strong> · {lignes.length} véhicule(s)</span>
        <Button onClick={onClose}>Annuler</Button>
        <AsyncButton variant="primary" disabled={!fid} onRun={async () => {
          if (await toast.run(() => api.achatCreer(fid, lignes, notes), 'Commande enregistrée')) onClose();
        }}>Enregistrer la commande</AsyncButton>
      </>
    }>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fournisseur">
            <Select value={fid} onChange={(e) => setFid(e.target.value)}>
              <option value="">Choisir…</option>
              {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </Select>
          </Field>
          <Field label="Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Référence facture, conditions…" /></Field>
        </div>
        {fournisseurs.length === 0 && <p className="text-[13px] text-amber">Aucun fournisseur actif. <button className="underline" onClick={() => go('fournisseurs')}>Créer un fournisseur</button></p>}
        <div className="space-y-2">
          {lignes.map((l, i) => (
            <div key={i} className="grid items-end gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1fr_1fr_1fr_80px_1fr_1.4fr_1.2fr_auto]">
              <Field label="Marque"><Input value={l.marque} onChange={(e) => setL(i, { marque: e.target.value })} /></Field>
              <Field label="Modèle"><Input value={l.modele} onChange={(e) => setL(i, { modele: e.target.value })} /></Field>
              <Field label="Finition"><Input value={l.finition} onChange={(e) => setL(i, { finition: e.target.value })} /></Field>
              <Field label="Année"><Input type="number" value={l.annee} onChange={(e) => setL(i, { annee: Number(e.target.value) })} /></Field>
              <Field label="Couleur"><Input value={l.couleur} onChange={(e) => setL(i, { couleur: e.target.value })} /></Field>
              <Field label="VIN (si connu)"><Input value={l.vin} maxLength={17} onChange={(e) => setL(i, { vin: e.target.value.toUpperCase() })} /></Field>
              <Field label="Prix d'achat"><MoneyInput value={l.prix_achat} onChange={(n) => setL(i, { prix_achat: n })} /></Field>
              <button disabled={lignes.length === 1} onClick={() => setLignes((ls) => ls.filter((_, j) => j !== i))} className="mb-1 rounded-md p-2 text-muted hover:bg-surface-2 hover:text-red disabled:opacity-30" aria-label="Retirer la ligne">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setLignes((ls) => [...ls, emptyLine()])}>Ajouter un véhicule</Button>
        <p className="text-xs text-muted">Le stock n'augmente qu'à la réception de chaque véhicule.</p>
      </div>
    </Modal>
  );
}

function ReceptionModal({ ligne, onClose }: { ligne: AchatLigne; onClose: () => void }) {
  const toast = useToast();
  const { depots } = useDepots();
  const [f, setF] = useState({ depot_id: depots.find((d) => d.actif)?.id ?? '', vin: ligne.vin, prix_vente_ht: 0, kilometrage: 0, etat: 'neuf' as Vehicule['etat'], carburant: 'essence' as Vehicule['carburant'], boite: 'manuelle' as Vehicule['boite'] });
  return (
    <Modal open onClose={onClose} title={`Réceptionner ${ligne.marque} ${ligne.modele}`} footer={
      <>
        <Button onClick={onClose}>Annuler</Button>
        <AsyncButton variant="primary" disabled={!f.depot_id} onRun={async () => {
          if (await toast.run(() => api.achatReceptionner(ligne.id, f), 'Véhicule réceptionné et entré en stock')) onClose();
        }}>Confirmer la réception</AsyncButton>
      </>
    }>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Dépôt de réception">
          <Select value={f.depot_id} onChange={(e) => setF({ ...f, depot_id: e.target.value })}>
            {depots.filter((d) => d.actif).map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
          </Select>
        </Field>
        <Field label="N° de châssis (VIN)" hint="Vérifiez-le sur le véhicule"><Input value={f.vin} maxLength={17} onChange={(e) => setF({ ...f, vin: e.target.value.toUpperCase() })} /></Field>
        <Field label="État">
          <Select value={f.etat} onChange={(e) => setF({ ...f, etat: e.target.value as Vehicule['etat'] })}>{Object.entries(ETAT_VEHICULE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        </Field>
        <Field label="Kilométrage"><Input type="number" min={0} value={f.kilometrage} onChange={(e) => setF({ ...f, kilometrage: Number(e.target.value) })} /></Field>
        <Field label="Énergie">
          <Select value={f.carburant} onChange={(e) => setF({ ...f, carburant: e.target.value as Vehicule['carburant'] })}>{Object.entries(CARBURANT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        </Field>
        <Field label="Boîte">
          <Select value={f.boite} onChange={(e) => setF({ ...f, boite: e.target.value as Vehicule['boite'] })}>{Object.entries(BOITE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        </Field>
        <Field label="Prix de vente affiché (HT)" hint={`Prix d'achat : ${da(ligne.prix_achat)}`} className="sm:col-span-2"><MoneyInput value={f.prix_vente_ht} onChange={(n) => setF({ ...f, prix_vente_ht: n })} /></Field>
      </div>
    </Modal>
  );
}

function PaiementFournisseurModal({ achat, reste, onClose }: { achat: Achat; reste: number; onClose: () => void }) {
  const { can } = useApp();
  const toast = useToast();
  const cash = useOpenCash(can('caisse.voir'));
  const [montant, setMontant] = useState(reste);
  const [mode, setMode] = useState('virement');
  const [ref, setRef] = useState('');
  return (
    <Modal open onClose={onClose} title={`Payer ${achat.numero}`} size="sm" footer={
      <>
        <Button onClick={onClose}>Annuler</Button>
        <AsyncButton variant="primary" disabled={montant <= 0 || montant > reste} onRun={async () => {
          if (await toast.run(() => api.fournisseurPayer(achat.id, montant, mode, ref), `Paiement de ${da(montant)} enregistré`)) onClose();
        }}>Enregistrer le paiement</AsyncButton>
      </>
    }>
      <div className="space-y-3">
        <p className="text-[13px] text-muted">Reste à payer : {da(reste)}</p>
        <Field label="Montant" error={montant > reste ? `Maximum ${da(reste)}` : undefined}><MoneyInput value={montant} onChange={setMontant} /></Field>
        <Field label="Mode">
          <Select value={mode} onChange={(e) => setMode(e.target.value)}>
            {can('caisse.operer') && <option value="especes">Espèces (caisse)</option>}
            <option value="virement">Virement</option><option value="cheque">Chèque</option><option value="traite">Traite</option>
          </Select>
        </Field>
        <Field label="Référence"><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        {mode === 'especes' && !cash?.session && <p className="text-[13px] text-red">Aucune caisse ouverte.</p>}
      </div>
    </Modal>
  );
}

function AchatDetail({ achat, onClose }: { achat: Achat; onClose: () => void }) {
  const { go, can } = useApp();
  const toast = useToast();
  const fournisseurs = useFournisseursMap();
  const lignes = useTable<AchatLigne>('achat_lignes', { eq: { achat_id: achat.id }, order: { column: 'position' } }) ?? [];
  const paiements = useTable<PaiementFournisseur>('paiements_fournisseurs', { eq: { achat_id: achat.id }, order: { column: 'date' } }) ?? [];
  const paye = paiements.reduce((s, p) => s + p.montant, 0);
  const reste = achat.statut === 'annule' ? 0 : achat.montant_total - paye;
  const [recep, setRecep] = useState<AchatLigne | null>(null);
  const [pay, setPay] = useState(false);
  const [cancel, setCancel] = useState(false);
  const st = STATUT_ACHAT[achat.statut];

  return (
    <Modal open onClose={onClose} title={`Commande ${achat.numero}`} size="lg" footer={
      <>
        {can('achats.gerer') && achat.statut === 'commande' && paiements.length === 0 && <Button icon={<Ban className="h-4 w-4" />} onClick={() => setCancel(true)}>Annuler la commande</Button>}
        {can('achats.gerer') && reste > 0 && <Button variant="primary" icon={<Wallet className="h-4 w-4" />} onClick={() => setPay(true)}>Enregistrer un paiement</Button>}
      </>
    }>
      <div className="mb-4 flex gap-2"><Badge tone={st.tone}>{st.label}</Badge>{reste > 0 && <Badge tone="amber">Reste {da(reste)}</Badge>}</div>
      <KeyValue items={[
        ['Fournisseur', fournisseurs.get(achat.fournisseur_id)?.nom ?? '—'],
        ['Date', date(achat.date)],
        ['Créée par', achat.user_nom],
        ['Montant total', <Money key="t" value={achat.montant_total} strong />],
        ['Payé', <Money key="p" value={paye} />],
      ]} />
      {achat.notes && <p className="mt-3 whitespace-pre-line rounded-lg bg-surface-2 p-3 text-[13px]">{achat.notes}</p>}

      <h3 className="mb-2 mt-6 font-semibold">Véhicules</h3>
      <div className="divide-y divide-line rounded-lg border border-line">
        {lignes.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
            <div>
              <div className="font-medium">{l.marque} {l.modele} {l.finition} <span className="font-normal text-muted">{l.annee}{l.couleur ? ` · ${l.couleur}` : ''}</span></div>
              <div className="text-xs text-muted">{l.vin || 'VIN à saisir à la réception'}</div>
            </div>
            <div className="flex items-center gap-3">
              <Money value={l.prix_achat} />
              {l.recu
                ? <button onClick={() => l.vehicule_id && go('vehicules', { open: l.vehicule_id })}><Badge tone="green">Reçu — voir</Badge></button>
                : achat.statut !== 'annule' && can('stock.receptionner') && <Button size="sm" variant="primary" onClick={() => setRecep(l)}>Réceptionner</Button>}
            </div>
          </div>
        ))}
      </div>

      <h3 className="mb-2 mt-6 font-semibold">Paiements</h3>
      {paiements.length === 0 ? <p className="text-muted">Aucun paiement.</p> : (
        <table className="w-full text-[13px]"><tbody>
          {paiements.map((p) => (
            <tr key={p.id} className="border-b border-line last:border-0">
              <td className="py-2">{dateTime(p.date)}</td><td className="py-2">{p.numero}</td>
              <td className="py-2">{MODE_LABELS[p.mode]}{p.reference ? ` · ${p.reference}` : ''}</td>
              <td className="py-2 text-end"><Money value={p.montant} /></td>
            </tr>
          ))}
        </tbody></table>
      )}

      {recep && <ReceptionModal ligne={recep} onClose={() => setRecep(null)} />}
      {pay && <PaiementFournisseurModal achat={achat} reste={reste} onClose={() => setPay(false)} />}
      <ConfirmDialog open={cancel} onClose={() => setCancel(false)} title="Annuler la commande" danger confirmLabel="Annuler la commande"
        message="La commande restera visible avec le statut « Annulée »." requireReason="Motif"
        onConfirm={async (r) => { if (await toast.run(() => api.achatAnnuler(achat.id, r), 'Commande annulée')) setCancel(false); }} />
    </Modal>
  );
}

export function AchatsPage() {
  const { can } = useApp();
  const fournisseurs = useFournisseursMap();
  const achats = useTable<Achat>('achats');
  const paiements = useTable<PaiementFournisseur>('paiements_fournisseurs') ?? [];
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [statut, setStatut] = useState('');
  const opened = achats?.find((a) => a.id === openId);

  const payeById = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of paiements) m.set(p.achat_id, (m.get(p.achat_id) ?? 0) + p.montant);
    return m;
  }, [paiements]);
  const reste = (a: Achat) => (a.statut === 'annule' ? 0 : a.montant_total - (payeById.get(a.id) ?? 0));
  const rows = useMemo(() => (achats ?? []).filter((a) => !statut || a.statut === statut), [achats, statut]);

  const columns: Column<Achat>[] = [
    { key: 'numero', header: 'N°', sortValue: (a) => a.numero, render: (a) => <span className="font-medium">{a.numero}</span> },
    { key: 'date', header: 'Date', sortValue: (a) => a.date, render: (a) => date(a.date) },
    { key: 'f', header: 'Fournisseur', sortValue: (a) => fournisseurs.get(a.fournisseur_id)?.nom ?? '', render: (a) => fournisseurs.get(a.fournisseur_id)?.nom ?? '—' },
    { key: 'statut', header: 'Statut', sortValue: (a) => a.statut, render: (a) => <Badge tone={STATUT_ACHAT[a.statut].tone}>{STATUT_ACHAT[a.statut].label}</Badge> },
    { key: 'total', header: 'Montant', align: 'end', sortValue: (a) => a.montant_total, render: (a) => <Money value={a.montant_total} /> },
    { key: 'reste', header: 'Reste à payer', align: 'end', sortValue: reste, render: (a) => reste(a) > 0 ? <Money value={reste(a)} className="text-amber" /> : <span className="text-muted">—</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Achats et réceptions"
        description="Commandes fournisseurs, réception des véhicules en stock et paiements."
        actions={
          <>
            <Button onClick={() => downloadCsv(`achats-${toInputDate(Date.now())}.csv`, [
              ['N°', 'Date', 'Fournisseur', 'Statut', 'Montant', 'Payé', 'Reste'],
              ...rows.map((a) => [a.numero, date(a.date), fournisseurs.get(a.fournisseur_id)?.nom ?? '', STATUT_ACHAT[a.statut].label, a.montant_total, payeById.get(a.id) ?? 0, reste(a)]),
            ])}>Exporter CSV</Button>
            {can('achats.gerer') && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Nouvelle commande</Button>}
          </>
        }
      />
      <DataTable
        rows={achats ? rows : undefined}
        columns={columns}
        rowKey={(a) => a.id}
        initialSort={{ key: 'date', dir: 'desc' }}
        searchText={(a) => `${a.numero} ${fournisseurs.get(a.fournisseur_id)?.nom ?? ''} ${a.notes}`}
        onRowClick={(a) => setOpenId(a.id)}
        filters={
          <Select value={statut} onChange={(e) => setStatut(e.target.value)} className="w-auto" aria-label="Statut">
            <option value="">Tous les statuts</option>
            {Object.entries(STATUT_ACHAT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        }
        empty={<EmptyState icon={<PackageCheck className="h-8 w-8" />} title="Aucune commande d'achat" text="Une commande permet de suivre ce qui est attendu, payé et reçu chez chaque fournisseur." action={can('achats.gerer') ? <Button variant="primary" onClick={() => setCreating(true)}>Nouvelle commande</Button> : undefined} />}
      />
      {creating && <NouvelAchat onClose={() => setCreating(false)} />}
      {opened && <AchatDetail achat={opened} onClose={() => setOpenId(null)} />}
    </div>
  );
}
