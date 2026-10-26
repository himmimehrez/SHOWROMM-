import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Car, Plus, Download, ArrowLeftRight, Lock, Unlock, Pencil, Receipt } from 'lucide-react';
import { useApp } from '../app-context';
import { db } from '../lib/db';
import { useDepots, useFournisseursMap, STOCK_AGE_ALERT_DAYS } from '../lib/hooks';
import * as S from '../lib/services';
import { da, date, dateTime, downloadCsv, num, toInputDate, parseInputDate } from '../lib/format';
import { STATUT_VEHICULE, ETAT_VEHICULE, CARBURANT, BOITE, TYPE_MOUVEMENT } from '../lib/labels';
import type { Vehicule, StatutVehicule, ModePaiement } from '../lib/types';
import { DataTable, type Column } from '../components/DataTable';
import {
  AsyncButton, Badge, Button, ConfirmDialog, EmptyState, Field, Input, KeyValue, Modal, Money, MoneyInput,
  PageHeader, Select, Tabs, Textarea,
} from '../components/ui';
import { useToast } from '../components/toast';

const EMPTY: S.VehiculeInput = {
  vin: '', immatriculation: '', marque: '', modele: '', finition: '', annee: new Date().getFullYear(), couleur: '',
  carburant: 'essence', boite: 'manuelle', kilometrage: 0, etat: 'neuf', depot_id: '', prix_achat: 0, prix_vente: 0, notes: '',
};

export function VehiculeForm({ initial, onSubmit, onCancel, isEdit }: { initial: S.VehiculeInput; onSubmit: (v: S.VehiculeInput) => Promise<boolean>; onCancel: () => void; isEdit: boolean }) {
  const { can } = useApp();
  const { depots } = useDepots();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof S.VehiculeInput>(k: K, v: S.VehiculeInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const marge = f.prix_vente - f.prix_achat;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        try { await onSubmit(f); } finally { setBusy(false); }
      }}
      className="space-y-5"
    >
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 font-semibold">Identification</legend>
        <Field label="Marque"><Input value={f.marque} onChange={(e) => set('marque', e.target.value)} required /></Field>
        <Field label="Modèle"><Input value={f.modele} onChange={(e) => set('modele', e.target.value)} required /></Field>
        <Field label="Finition / version"><Input value={f.finition} onChange={(e) => set('finition', e.target.value)} /></Field>
        <Field label="N° de châssis (VIN)" hint="17 caractères, facultatif"><Input value={f.vin} onChange={(e) => set('vin', e.target.value.toUpperCase())} maxLength={17} /></Field>
        <Field label="Immatriculation"><Input value={f.immatriculation} onChange={(e) => set('immatriculation', e.target.value)} placeholder="00123 125 19" /></Field>
        <Field label="Année"><Input type="number" value={f.annee} onChange={(e) => set('annee', Number(e.target.value))} min={1980} max={2100} required /></Field>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 font-semibold">Caractéristiques</legend>
        <Field label="Couleur"><Input value={f.couleur} onChange={(e) => set('couleur', e.target.value)} /></Field>
        <Field label="Énergie">
          <Select value={f.carburant} onChange={(e) => set('carburant', e.target.value as S.VehiculeInput['carburant'])}>
            {Object.entries(CARBURANT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Boîte">
          <Select value={f.boite} onChange={(e) => set('boite', e.target.value as S.VehiculeInput['boite'])}>
            {Object.entries(BOITE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Kilométrage"><Input type="number" min={0} value={f.kilometrage} onChange={(e) => set('kilometrage', Number(e.target.value))} /></Field>
        <Field label="État">
          <Select value={f.etat} onChange={(e) => set('etat', e.target.value as S.VehiculeInput['etat'])}>
            {Object.entries(ETAT_VEHICULE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Dépôt" hint={isEdit ? 'Utilisez « Transférer » pour changer de dépôt' : undefined}>
          <Select value={f.depot_id} onChange={(e) => set('depot_id', e.target.value)} disabled={isEdit} required>
            <option value="">Choisir…</option>
            {depots.filter((d) => d.actif).map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
          </Select>
        </Field>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 font-semibold">Prix</legend>
        {can('couts.voir') && <Field label="Prix d'achat"><MoneyInput value={f.prix_achat} onChange={(n) => set('prix_achat', n)} /></Field>}
        <Field label="Prix de vente affiché" hint={isEdit && !can('vehicules.prix') ? 'Modification réservée au gérant' : undefined}>
          <MoneyInput value={f.prix_vente} onChange={(n) => set('prix_vente', n)} disabled={isEdit && !can('vehicules.prix')} />
        </Field>
        {can('couts.voir') && (
          <div className="flex flex-col justify-end pb-2 text-[13px] text-muted">
            Marge brute avant frais : <span className={marge < 0 ? 'font-semibold text-red' : 'font-semibold text-ink'}>{da(marge)}</span>
          </div>
        )}
      </fieldset>

      <Field label="Notes internes"><Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={2} /></Field>

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" onClick={onCancel}>Annuler</Button>
        <Button type="submit" variant="primary" loading={busy}>{isEdit ? 'Enregistrer les modifications' : 'Ajouter au stock'}</Button>
      </div>
    </form>
  );
}

function FraisForm({ vehicule, onDone }: { vehicule: Vehicule; onDone: () => void }) {
  const { user, settings } = useApp();
  const toast = useToast();
  const [f, setF] = useState({ categorie: settings.categories_depenses[0] ?? '', libelle: '', montant: 0, mode: 'especes' as ModePaiement, beneficiaire: '', date: toInputDate(Date.now()) });
  return (
    <div className="grid gap-3 rounded-lg border border-line bg-surface-2 p-3 sm:grid-cols-6">
      <Field label="Catégorie" className="sm:col-span-2">
        <Select value={f.categorie} onChange={(e) => setF({ ...f, categorie: e.target.value })}>
          {settings.categories_depenses.map((c) => <option key={c}>{c}</option>)}
        </Select>
      </Field>
      <Field label="Libellé" className="sm:col-span-4"><Input value={f.libelle} onChange={(e) => setF({ ...f, libelle: e.target.value })} placeholder="Ex. : transport port → showroom" /></Field>
      <Field label="Montant" className="sm:col-span-2"><MoneyInput value={f.montant} onChange={(n) => setF({ ...f, montant: n })} /></Field>
      <Field label="Réglé par" className="sm:col-span-2">
        <Select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as ModePaiement })}>
          <option value="especes">Espèces (caisse)</option><option value="cheque">Chèque</option><option value="virement">Virement</option><option value="tpe">Carte</option>
        </Select>
      </Field>
      <Field label="Date" className="sm:col-span-2"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <div className="flex justify-end gap-2 sm:col-span-6">
        <Button onClick={onDone}>Annuler</Button>
        <AsyncButton variant="primary" onRun={async () => {
          const ok = await toast.run(() => S.createDepense(user, { ...f, date: parseInputDate(f.date), vehicule_id: vehicule.id }), 'Frais ajouté au véhicule');
          if (ok) onDone();
        }}>Ajouter le frais</AsyncButton>
      </div>
    </div>
  );
}

function VehiculeDetail({ vehicule, onClose }: { vehicule: Vehicule; onClose: () => void }) {
  const { user, can, go } = useApp();
  const toast = useToast();
  const { depots, depotById } = useDepots();
  const fournisseurs = useFournisseursMap();
  const [tab, setTab] = useState<'fiche' | 'frais' | 'historique'>('fiche');
  const [editing, setEditing] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [transferMotif, setTransferMotif] = useState('');
  const [blockOpen, setBlockOpen] = useState(false);
  const [addFrais, setAddFrais] = useState(false);

  const frais = useLiveQuery(() => db.depenses.where('vehicule_id').equals(vehicule.id).toArray(), [vehicule.id]) ?? [];
  const mouvements = useLiveQuery(() => db.mouvements.where('vehicule_id').equals(vehicule.id).reverse().sortBy('date'), [vehicule.id]) ?? [];
  const vente = useLiveQuery(() => db.ventes.where('vehicule_id').equals(vehicule.id).filter((v) => v.statut !== 'annulee').first(), [vehicule.id]);
  const totalFrais = frais.filter((d) => !d.annulee).reduce((s, d) => s + d.montant, 0);
  const cout = vehicule.prix_achat + totalFrais;
  const st = STATUT_VEHICULE[vehicule.statut];

  if (editing) {
    return (
      <Modal open onClose={() => setEditing(false)} title={`Modifier ${vehicule.reference}`} size="lg">
        <VehiculeForm
          isEdit
          initial={{ ...vehicule }}
          onCancel={() => setEditing(false)}
          onSubmit={async (v) => {
            const ok = await toast.run(() => S.updateVehicule(user, vehicule.id, v), 'Fiche véhicule enregistrée');
            if (ok) setEditing(false);
            return ok;
          }}
        />
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${vehicule.marque} ${vehicule.modele} ${vehicule.finition}`.trim()}
      footer={
        <>
          {can('stock.transferer') && vehicule.statut !== 'livre' && (
            <>
              <Button icon={<ArrowLeftRight className="h-4 w-4" />} onClick={() => { setTransferTo(''); setTransferMotif(''); setTransfer(true); }}>Transférer</Button>
              {(vehicule.statut === 'disponible' || vehicule.statut === 'bloque') && (
                <Button icon={vehicule.statut === 'bloque' ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />} onClick={() => setBlockOpen(true)}>
                  {vehicule.statut === 'bloque' ? 'Débloquer' : 'Bloquer'}
                </Button>
              )}
            </>
          )}
          {can('vehicules.gerer') && vehicule.statut !== 'livre' && <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Modifier</Button>}
          {vente && <Button icon={<Receipt className="h-4 w-4" />} onClick={() => go('ventes', { open: vente.id })}>Voir la vente {vente.numero}</Button>}
          {can('ventes.creer') && vehicule.statut === 'disponible' && (
            <Button variant="primary" onClick={() => go('ventes', { nouvelle: '1', vehicule: vehicule.id })}>Vendre ce véhicule</Button>
          )}
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="plate">{vehicule.immatriculation || vehicule.reference}</span>
        <Badge tone={st.tone}>{st.label}</Badge>
        <Badge>{ETAT_VEHICULE[vehicule.etat]}</Badge>
        {vehicule.demo && <Badge tone="amber">Démonstration</Badge>}
      </div>
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'fiche', label: 'Fiche' },
        ...(can('couts.voir') ? [{ id: 'frais' as const, label: 'Coûts et frais', count: frais.length }] : []),
        { id: 'historique', label: 'Historique', count: mouvements.length },
      ]} />
      <div className="pt-4">
        {tab === 'fiche' && (
          <div className="grid gap-6 sm:grid-cols-2">
            <KeyValue items={[
              ['Référence', vehicule.reference],
              ['VIN', vehicule.vin || '—'],
              ['Année', vehicule.annee],
              ['Couleur', vehicule.couleur || '—'],
              ['Énergie', CARBURANT[vehicule.carburant]],
              ['Boîte', BOITE[vehicule.boite]],
              ['Kilométrage', `${num(vehicule.kilometrage)} km`],
            ]} />
            <KeyValue items={[
              ['Dépôt', depotById.get(vehicule.depot_id)?.nom ?? '—'],
              ['Fournisseur', fournisseurs.get(vehicule.fournisseur_id)?.nom ?? '—'],
              ['Entré en stock le', date(vehicule.created_at)],
              ['Prix de vente', <Money key="pv" value={vehicule.prix_vente} strong />],
              ...(can('couts.voir') ? [
                ["Prix d'achat", <Money key="pa" value={vehicule.prix_achat} />] as [string, React.ReactNode],
                ['Coût de revient', <Money key="cr" value={cout} />] as [string, React.ReactNode],
                ['Marge estimée', <Money key="mg" value={vehicule.prix_vente - cout} strong />] as [string, React.ReactNode],
              ] : []),
            ]} />
            {vehicule.notes && <p className="rounded-lg bg-surface-2 p-3 text-[13px] sm:col-span-2">{vehicule.notes}</p>}
          </div>
        )}
        {tab === 'frais' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-[13px]">
              <div className="rounded-lg bg-surface-2 p-3"><div className="text-muted">Prix d'achat</div><Money value={vehicule.prix_achat} strong /></div>
              <div className="rounded-lg bg-surface-2 p-3"><div className="text-muted">Frais annexes</div><Money value={totalFrais} strong /></div>
              <div className="rounded-lg bg-surface-2 p-3"><div className="text-muted">Coût de revient</div><Money value={cout} strong /></div>
            </div>
            {addFrais ? <FraisForm vehicule={vehicule} onDone={() => setAddFrais(false)} /> : (
              can('depenses.gerer') && vehicule.statut !== 'livre' && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAddFrais(true)}>Ajouter un frais</Button>
            )}
            {frais.length === 0 ? <p className="text-muted">Aucun frais rattaché à ce véhicule.</p> : (
              <table className="w-full text-[13px]">
                <tbody>
                  {frais.map((d) => (
                    <tr key={d.id} className="border-b border-line last:border-0">
                      <td className="py-2">{date(d.date)}</td>
                      <td className="py-2">{d.categorie}</td>
                      <td className="py-2">{d.libelle}</td>
                      <td className="py-2 text-end">{d.annulee ? <Badge tone="red">Annulé</Badge> : <Money value={d.montant} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        {tab === 'historique' && (
          <ol className="space-y-3">
            {mouvements.map((m) => (
              <li key={m.id} className="flex gap-3 text-[13px]">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
                <div>
                  <div className="font-medium">{TYPE_MOUVEMENT[m.type]}{m.depot_to && m.type === 'transfert' ? ` → ${depotById.get(m.depot_to)?.nom ?? ''}` : ''}</div>
                  <div className="text-muted">{dateTime(m.date)} · {m.user} · {m.ref}{m.motif ? ` · ${m.motif}` : ''}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <Modal open={transfer} onClose={() => setTransfer(false)} title="Transférer vers un autre dépôt" size="sm" footer={
        <>
          <Button onClick={() => setTransfer(false)}>Annuler</Button>
          <AsyncButton variant="primary" disabled={!transferTo || !transferMotif.trim()} onRun={async () => {
            if (await toast.run(() => S.transfererVehicule(user, vehicule.id, transferTo, transferMotif), 'Véhicule transféré')) setTransfer(false);
          }}>Transférer</AsyncButton>
        </>
      }>
        <div className="space-y-3">
          <Field label="Dépôt de destination">
            <Select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
              <option value="">Choisir…</option>
              {depots.filter((d) => d.actif && d.id !== vehicule.depot_id).map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
            </Select>
          </Field>
          <Field label="Motif"><Input value={transferMotif} onChange={(e) => setTransferMotif(e.target.value)} placeholder="Ex. : exposition au showroom" /></Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        title={vehicule.statut === 'bloque' ? 'Débloquer le véhicule' : 'Bloquer le véhicule'}
        message={vehicule.statut === 'bloque' ? 'Le véhicule redeviendra disponible à la vente.' : "Un véhicule bloqué ne peut pas être vendu (litige, réparation, papiers manquants…)."}
        confirmLabel={vehicule.statut === 'bloque' ? 'Débloquer' : 'Bloquer'}
        requireReason="Motif"
        onConfirm={async (r) => {
          if (await toast.run(() => S.bloquerVehicule(user, vehicule.id, vehicule.statut !== 'bloque', r), vehicule.statut === 'bloque' ? 'Véhicule débloqué' : 'Véhicule bloqué')) setBlockOpen(false);
        }}
      />
    </Modal>
  );
}

type Filtre = 'stock' | 'tous' | StatutVehicule | 'anciens' | 'sans_prix';

export function VehiculesPage() {
  const { user, can, route, go } = useApp();
  const toast = useToast();
  const { depots, depotById } = useDepots();
  const vehicules = useLiveQuery(() => db.vehicules.toArray(), []);
  const frais = useLiveQuery(() => db.depenses.where('vehicule_id').notEqual('').toArray(), []) ?? [];
  const [filtre, setFiltre] = useState<Filtre>((route.params.filtre as Filtre) || 'stock');
  const [depot, setDepot] = useState('');
  const [creating, setCreating] = useState(false);
  const openId = route.params.open;
  const opened = openId ? vehicules?.find((v) => v.id === openId) : undefined;

  useEffect(() => { if (route.params.filtre) setFiltre(route.params.filtre as Filtre); }, [route.params.filtre]);

  const coutById = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of frais) if (!d.annulee) m.set(d.vehicule_id, (m.get(d.vehicule_id) ?? 0) + d.montant);
    return m;
  }, [frais]);

  const rows = useMemo(() => (vehicules ?? []).filter((v) => {
    if (depot && v.depot_id !== depot) return false;
    switch (filtre) {
      case 'stock': return v.statut !== 'livre';
      case 'tous': return true;
      case 'anciens': return v.statut === 'disponible' && Date.now() - v.created_at > STOCK_AGE_ALERT_DAYS * 86400000;
      case 'sans_prix': return v.statut === 'disponible' && v.prix_vente <= 0;
      default: return v.statut === filtre;
    }
  }), [vehicules, filtre, depot]);

  const showCost = can('couts.voir');
  const columns: Column<Vehicule>[] = [
    { key: 'ref', header: 'Véhicule', sortValue: (v) => `${v.marque} ${v.modele}`, render: (v) => (
      <div>
        <div className="font-medium">{v.marque} {v.modele} <span className="font-normal text-muted">{v.finition}</span></div>
        <div className="text-xs text-muted">{v.reference}{v.vin ? ` · ${v.vin}` : ''}</div>
      </div>
    ) },
    { key: 'annee', header: 'Année', sortValue: (v) => v.annee, render: (v) => v.annee, hideOnMobile: true },
    { key: 'etat', header: 'État', render: (v) => ETAT_VEHICULE[v.etat], hideOnMobile: true },
    { key: 'depot', header: 'Dépôt', sortValue: (v) => depotById.get(v.depot_id)?.nom ?? '', render: (v) => depotById.get(v.depot_id)?.nom ?? '—', hideOnMobile: true },
    { key: 'statut', header: 'Statut', sortValue: (v) => v.statut, render: (v) => <Badge tone={STATUT_VEHICULE[v.statut].tone}>{STATUT_VEHICULE[v.statut].label}</Badge> },
    { key: 'jours', header: 'En stock', align: 'end', sortValue: (v) => v.created_at, hideOnMobile: true, render: (v) => {
      const j = Math.floor((Date.now() - v.created_at) / 86400000);
      return <span className={j > STOCK_AGE_ALERT_DAYS && v.statut === 'disponible' ? 'font-medium text-amber' : 'text-muted'}>{j} j</span>;
    } },
    ...(showCost ? [{ key: 'cout', header: 'Coût de revient', align: 'end' as const, hideOnMobile: true, sortValue: (v: Vehicule) => v.prix_achat + (coutById.get(v.id) ?? 0), render: (v: Vehicule) => <Money value={v.prix_achat + (coutById.get(v.id) ?? 0)} /> }] : []),
    { key: 'prix', header: 'Prix de vente', align: 'end', sortValue: (v) => v.prix_vente, render: (v) => v.prix_vente > 0 ? <Money value={v.prix_vente} strong /> : <Badge tone="red">Sans prix</Badge> },
  ];

  const exportCsv = () => {
    downloadCsv(`vehicules-${toInputDate(Date.now())}.csv`, [
      ['Référence', 'VIN', 'Immatriculation', 'Marque', 'Modèle', 'Finition', 'Année', 'Couleur', 'Énergie', 'État', 'Statut', 'Dépôt', 'Entrée', ...(showCost ? ["Prix d'achat", 'Frais', 'Coût de revient'] : []), 'Prix de vente'],
      ...rows.map((v) => [
        v.reference, v.vin, v.immatriculation, v.marque, v.modele, v.finition, v.annee, v.couleur, CARBURANT[v.carburant], ETAT_VEHICULE[v.etat],
        STATUT_VEHICULE[v.statut].label, depotById.get(v.depot_id)?.nom ?? '', date(v.created_at),
        ...(showCost ? [v.prix_achat, coutById.get(v.id) ?? 0, v.prix_achat + (coutById.get(v.id) ?? 0)] : []), v.prix_vente,
      ]),
    ]);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const v of vehicules ?? []) c[v.statut] = (c[v.statut] ?? 0) + 1;
    return c;
  }, [vehicules]);

  return (
    <div>
      <PageHeader
        title="Véhicules"
        description={`${counts.disponible ?? 0} disponible(s) · ${counts.vendu ?? 0} vendu(s) à livrer · ${counts.bloque ?? 0} bloqué(s)`}
        actions={
          <>
            <Button icon={<Download className="h-4 w-4" />} onClick={exportCsv}>Exporter CSV</Button>
            {can('vehicules.gerer') && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Ajouter un véhicule</Button>}
          </>
        }
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(v) => v.id}
        initialSort={{ key: 'jours', dir: 'asc' }}
        searchText={(v) => `${v.reference} ${v.vin} ${v.immatriculation} ${v.marque} ${v.modele} ${v.finition} ${v.couleur}`}
        searchPlaceholder="Marque, modèle, VIN, référence…"
        onRowClick={(v) => go('vehicules', { ...(route.params.filtre ? { filtre } : {}), open: v.id })}
        filters={
          <>
            <Select value={filtre} onChange={(e) => setFiltre(e.target.value as Filtre)} aria-label="Filtrer par statut" className="w-auto">
              <option value="stock">En parc (hors livrés)</option>
              <option value="disponible">Disponibles</option>
              <option value="vendu">Vendus à livrer</option>
              <option value="bloque">Bloqués</option>
              <option value="livre">Livrés</option>
              <option value="anciens">En stock depuis + de {STOCK_AGE_ALERT_DAYS} j</option>
              <option value="sans_prix">Sans prix de vente</option>
              <option value="tous">Tous</option>
            </Select>
            <Select value={depot} onChange={(e) => setDepot(e.target.value)} aria-label="Filtrer par dépôt" className="w-auto">
              <option value="">Tous les dépôts</option>
              {depots.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
            </Select>
          </>
        }
        empty={
          <EmptyState
            icon={<Car className="h-8 w-8" />}
            title={vehicules?.length ? 'Aucun véhicule ne correspond à ces filtres' : 'Aucun véhicule en stock'}
            text={vehicules?.length ? undefined : "Ajoutez un véhicule directement, ou réceptionnez une commande fournisseur depuis « Achats et réceptions »."}
            action={!vehicules?.length && can('vehicules.gerer') ? <Button variant="primary" onClick={() => setCreating(true)}>Ajouter un véhicule</Button> : undefined}
          />
        }
      />

      <Modal open={creating} onClose={() => setCreating(false)} title="Ajouter un véhicule au stock" size="lg">
        <VehiculeForm
          isEdit={false}
          initial={{ ...EMPTY, depot_id: depots.find((d) => d.actif)?.id ?? '' }}
          onCancel={() => setCreating(false)}
          onSubmit={async (v) => {
            const ok = await toast.run(() => S.createVehicule(user, v), 'Véhicule ajouté au stock');
            if (ok) setCreating(false);
            return ok;
          }}
        />
      </Modal>

      {opened && <VehiculeDetail vehicule={opened} onClose={() => go('vehicules', route.params.filtre ? { filtre } : {})} />}
    </div>
  );
}
