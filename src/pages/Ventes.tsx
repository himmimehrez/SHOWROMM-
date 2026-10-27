import React, { useEffect, useMemo, useState } from 'react';
import { Receipt, Plus, Download, FileText, Printer, Truck, Ban, Undo2, Wallet, FileSpreadsheet } from 'lucide-react';
import { useApp } from '../app-context';
import { useTable } from '../lib/data';
import { api } from '../lib/api';
import { resteAPayer, useClientsMap, useOpenCash, useSoldes, useVehiculesMap, useVenteCouts } from '../lib/hooks';
import { calculPrix, droitTimbre, MODE_PRIX_LABELS, tauxEffectif } from '../lib/fiscal';
import { da, date, dateTime, downloadCsv, MODE_LABELS, toInputDate, startOfMonth } from '../lib/format';
import { STATUT_PAIEMENT, STATUT_VENTE } from '../lib/labels';
import type { Client, ModePaiement, ModePrix, Paiement, Vehicule, Vente, VenteSolde } from '../lib/types';
import { DataTable, type Column } from '../components/DataTable';
import { DocumentModal, type DocKind } from '../components/Documents';
import { AsyncButton, Badge, Button, ConfirmDialog, EmptyState, Field, Input, KeyValue, Modal, Money, MoneyInput, PageHeader, Select, Textarea, cx } from '../components/ui';
import { useToast } from '../components/toast';
import { ClientForm, EMPTY_CLIENT } from './Clients';

// ───────────────────────────── Nouvelle vente ─────────────────────────────

function NouvelleVente({ onClose, presetVehicule, presetClient }: { onClose: (venteId?: string) => void; presetVehicule?: string; presetClient?: string }) {
  const { can, settings } = useApp();
  const toast = useToast();
  const clients = (useTable<Client>('clients', { order: { column: 'nom' } }) ?? []);
  const dispo = useTable<Vehicule>('vehicules', { eq: { statut: 'disponible' } }) ?? [];
  const [clientId, setClientId] = useState(presetClient ?? '');
  const [vehiculeId, setVehiculeId] = useState(presetVehicule ?? '');
  const [mode, setMode] = useState<ModePrix>('taux_ht');
  const [montant, setMontant] = useState(0);
  const [montantTtc, setMontantTtc] = useState(0);
  const [taux, setTaux] = useState<number>(settings.taux_tva.includes(19) ? 19 : settings.taux_tva[0] ?? 0);
  const [remise, setRemise] = useState(0);
  const [notes, setNotes] = useState('');
  const [newClient, setNewClient] = useState(false);
  const [busy, setBusy] = useState(false);
  const [vq, setVq] = useState('');

  const vehicule = dispo.find((v) => v.id === vehiculeId);
  // le prix affiché du véhicule (HT) pré-remplit le montant
  useEffect(() => {
    if (!vehicule) return;
    setMontant(mode === 'taux_ttc' ? Math.round(vehicule.prix_vente_ht * (1 + taux / 100)) : vehicule.prix_vente_ht);
    if (mode === 'montants') setMontantTtc(Math.round(vehicule.prix_vente_ht * 1.19));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehiculeId, mode]);

  const avecTaux = mode === 'taux_ht' || mode === 'taux_ttc';
  const prix = calculPrix(mode, montant, montantTtc, taux, avecTaux ? remise : 0);
  const remiseImplicite = vehicule ? (mode === 'taux_ht' ? remise : Math.max(remise, vehicule.prix_vente_ht - prix.ht)) : 0;
  const horsPlafond = Boolean(vehicule && vehicule.prix_vente_ht > 0 && remiseImplicite > settings.remise_max_commercial && !can('ventes.remise'));
  const filtered = dispo.filter((v) => `${v.marque} ${v.modele} ${v.finition} ${v.reference} ${v.vin}`.toLowerCase().includes(vq.toLowerCase()));

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    let created: Vente | undefined;
    const ok = await toast.run(async () => {
      created = await api.venteCreate({
        client: clientId, vehicule: vehiculeId, mode, montant, montantTtc: mode === 'montants' ? montantTtc : null,
        taux: avecTaux ? taux : null, remise: avecTaux ? remise : 0, notes,
      });
    }, 'Vente enregistrée');
    setBusy(false);
    if (ok && created) onClose(created.id);
  };

  if (newClient) {
    return (
      <Modal open onClose={() => setNewClient(false)} title="Nouveau client" size="lg">
        <ClientForm initial={EMPTY_CLIENT} onCancel={() => setNewClient(false)} onSubmit={async (c) => {
          let id = '';
          const ok = await toast.run(async () => { id = (await api.clientSave(null, c)).id; }, 'Client créé');
          if (ok) { setClientId(id); setNewClient(false); }
          return ok;
        }} />
      </Modal>
    );
  }

  return (
    <Modal open onClose={() => onClose()} title="Nouvelle vente" size="xl">
      <div className="grid gap-5 lg:grid-cols-[1fr_330px]">
        <div className="space-y-5">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">Client</h3>
              {can('clients.gerer') && <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setNewClient(true)}>Nouveau client</Button>}
            </div>
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client">
              <option value="">Choisir un client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.telephone ? ` — ${c.telephone}` : ''}</option>)}
            </Select>
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Véhicule disponible</h3>
            <Input value={vq} onChange={(e) => setVq(e.target.value)} placeholder="Filtrer par marque, modèle, VIN…" className="mb-2" aria-label="Filtrer les véhicules" />
            <div className="max-h-56 overflow-y-auto rounded-lg border border-line">
              {filtered.length === 0 && <div className="p-4 text-muted">Aucun véhicule disponible.</div>}
              {filtered.map((v) => (
                <button key={v.id} type="button" onClick={() => setVehiculeId(v.id)}
                  className={cx('flex w-full items-center justify-between gap-3 border-b border-line px-3 py-2.5 text-start last:border-0', v.id === vehiculeId ? 'bg-brand-soft' : 'hover:bg-surface-2')}>
                  <span>
                    <span className="block font-medium">{v.marque} {v.modele} <span className="font-normal text-muted">{v.finition} · {v.annee}</span></span>
                    <span className="block text-xs text-muted">{v.reference}{v.vin ? ` · ${v.vin}` : ''}{v.couleur ? ` · ${v.couleur}` : ''}</span>
                  </span>
                  {v.prix_vente_ht > 0 ? <span className="text-end"><Money value={v.prix_vente_ht} strong /><span className="block text-xs text-muted">HT</span></span> : <Badge tone="red">Sans prix</Badge>}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Prix et TVA</h3>
            <div role="radiogroup" aria-label="Mode de saisie du prix" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(MODE_PRIX_LABELS) as ModePrix[]).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                  className={cx('rounded-lg border px-3 py-2 text-start text-[13px]', mode === m ? 'border-brand bg-brand-soft font-medium' : 'border-line hover:bg-surface-2')}>
                  {MODE_PRIX_LABELS[m].titre}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{MODE_PRIX_LABELS[mode].aide}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {mode === 'taux_ht' && <Field label="Prix HT"><MoneyInput value={montant} onChange={setMontant} /></Field>}
              {mode === 'taux_ttc' && <Field label="Prix TTC"><MoneyInput value={montant} onChange={setMontant} /></Field>}
              {mode === 'montants' && (
                <>
                  <Field label="Montant HT"><MoneyInput value={montant} onChange={setMontant} /></Field>
                  <Field label="Montant TTC" error={prix.erreur}><MoneyInput value={montantTtc} onChange={setMontantTtc} /></Field>
                </>
              )}
              {mode === 'direct' && <Field label="Prix final" hint="Montant payé par le client"><MoneyInput value={montant} onChange={setMontant} /></Field>}
              {avecTaux && (
                <>
                  <Field label="Taux de TVA">
                    <Select value={taux} onChange={(e) => setTaux(Number(e.target.value))}>
                      {settings.taux_tva.map((t) => <option key={t} value={t}>{t} %</option>)}
                    </Select>
                  </Field>
                  <Field label="Remise (HT)" error={horsPlafond ? 'Au-delà du plafond : un gérant doit enregistrer cette vente.' : prix.erreur}
                    hint={!horsPlafond ? `Plafond sans autorisation : ${da(settings.remise_max_commercial)}` : undefined}>
                    <MoneyInput value={remise} onChange={setRemise} />
                  </Field>
                </>
              )}
            </div>
            {!avecTaux && horsPlafond && <p className="mt-2 text-[13px] text-red">Ce prix est inférieur de {da(remiseImplicite)} au prix affiché : au-delà du plafond, un gérant doit enregistrer cette vente.</p>}
            <Field label="Notes" className="mt-3"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Conditions particulières…" /></Field>
          </section>
        </div>

        <aside className="h-fit rounded-xl bg-surface-2 p-4 lg:sticky lg:top-0">
          <h3 className="font-semibold">Récapitulatif</h3>
          {vehicule ? (
            <>
              <p className="mt-2 text-[13px]">{vehicule.marque} {vehicule.modele} {vehicule.finition}</p>
              <dl className="mt-3 space-y-1.5 text-[13px]">
                <div className="flex justify-between"><dt className="text-muted">Prix affiché HT</dt><dd><Money value={vehicule.prix_vente_ht} /></dd></div>
                {avecTaux && remise > 0 && <div className="flex justify-between"><dt className="text-muted">Remise HT</dt><dd>− <Money value={remise} /></dd></div>}
                <div className="flex justify-between"><dt className="text-muted">Total HT</dt><dd><Money value={prix.ht} /></dd></div>
                <div className="flex justify-between"><dt className="text-muted">
                  {mode === 'direct' ? 'TVA' : mode === 'montants' ? `TVA (${tauxEffectif(prix).toFixed(2).replace('.', ',')} % effectif)` : `TVA ${taux} %`}
                </dt><dd>{mode === 'direct' ? 'non détaillée' : <Money value={prix.tva} />}</dd></div>
              </dl>
              <div className="mt-3 border-t border-line pt-3">
                <div className="text-[13px] text-muted">Total à payer TTC</div>
                <div className="text-[26px] font-semibold tracking-tight tabular-nums">{da(prix.ttc)}</div>
              </div>
            </>
          ) : <p className="mt-2 text-[13px] text-muted">Choisissez un véhicule.</p>}
          <Button variant="primary" size="lg" className="mt-4 w-full" loading={busy}
            disabled={!clientId || !vehicule || horsPlafond || Boolean(prix.erreur) || prix.ttc <= 0} onClick={submit}>
            Valider la vente
          </Button>
          <p className="mt-2 text-xs text-muted">Les paiements (espèces, chèque, virement, traite…) s'enregistrent ensuite sur la vente. Le bon de sortie n'est possible qu'une fois le prix réglé.</p>
        </aside>
      </div>
    </Modal>
  );
}

// ───────────────────────────── Paiement ─────────────────────────────

const MODES_ENCAISSEMENT: ModePaiement[] = ['especes', 'virement', 'cheque_certifie', 'cheque', 'traite', 'tpe'];

function PaiementModal({ vente, solde, onClose }: { vente: Vente; solde?: VenteSolde; onClose: () => void }) {
  const { settings, can } = useApp();
  const toast = useToast();
  const cash = useOpenCash(can('caisse.voir'));
  const paiements = useTable<Paiement>('paiements', { eq: { vente_id: vente.id } }) ?? [];
  const aCouvrir = vente.montant_ttc - (solde?.encaisse ?? 0) - (solde?.cheques_en_attente ?? 0) - (solde?.traites_en_portefeuille ?? 0);
  const [mode, setMode] = useState<ModePaiement>('especes');
  const [montant, setMontant] = useState(Math.max(0, aCouvrir));
  const [f, setF] = useState({ reference: '', banque: '', tireur: '', dateEmission: toInputDate(Date.now()), echeance: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const timbre = mode === 'especes' ? droitTimbre(montant, settings.timbre) : 0;
  const especesDeja = paiements.filter((p) => p.mode === 'especes' && p.statut === 'confirme' && p.sens === 'encaissement').reduce((s, p) => s + p.montant, 0);
  const depassePlafond = mode === 'especes' && settings.plafond_especes > 0 && especesDeja + montant > settings.plafond_especes;

  return (
    <Modal open onClose={onClose} title={`Enregistrer un paiement — ${vente.numero}`} footer={
      <>
        <Button onClick={onClose}>Annuler</Button>
        <AsyncButton variant="primary" disabled={montant <= 0 || montant > aCouvrir || (depassePlafond && !can('especes.depasser'))} onRun={async () => {
          if (await toast.run(() => api.paiementAjouter({ vente: vente.id, mode, montant, reference: f.reference, banque: f.banque, tireur: f.tireur, dateEmission: f.dateEmission, echeance: f.echeance }),
            mode === 'cheque' || mode === 'cheque_certifie' ? 'Chèque enregistré, en attente de confirmation de la banque'
              : mode === 'traite' ? 'Traite enregistrée en portefeuille' : `Paiement de ${da(montant)} enregistré`)) onClose();
        }}>Enregistrer</AsyncButton>
      </>
    }>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
          <div className="rounded-lg bg-surface-2 p-2.5"><div className="text-muted">Total TTC</div><Money value={vente.montant_ttc} strong /></div>
          <div className="rounded-lg bg-surface-2 p-2.5"><div className="text-muted">Encaissé</div><Money value={solde?.encaisse ?? 0} strong /></div>
          <div className="rounded-lg bg-surface-2 p-2.5"><div className="text-muted">Chèques / traites en cours</div><Money value={(solde?.cheques_en_attente ?? 0) + (solde?.traites_en_portefeuille ?? 0)} strong /></div>
          <div className="rounded-lg bg-surface-2 p-2.5"><div className="text-muted">Reste à couvrir</div><Money value={aCouvrir} strong /></div>
        </div>
        <div role="radiogroup" aria-label="Moyen de paiement" className="grid grid-cols-3 gap-2">
          {MODES_ENCAISSEMENT.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
              className={cx('rounded-lg border px-2 py-2 text-[13px]', mode === m ? 'border-brand bg-brand-soft font-medium' : 'border-line hover:bg-surface-2')}>
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Montant" error={montant > aCouvrir ? `Maximum ${da(aCouvrir)}` : undefined}><MoneyInput value={montant} onChange={setMontant} /></Field>
          {mode === 'virement' && <Field label="Référence du virement"><Input value={f.reference} onChange={set('reference')} /></Field>}
          {mode === 'tpe' && <Field label="Référence (facultatif)"><Input value={f.reference} onChange={set('reference')} /></Field>}
          {(mode === 'cheque' || mode === 'cheque_certifie') && (
            <>
              <Field label="Banque"><Input value={f.banque} onChange={set('banque')} placeholder="BNA, CPA, BEA, BDL…" /></Field>
              <Field label="N° du chèque"><Input value={f.reference} onChange={set('reference')} /></Field>
              <Field label="Titulaire du chèque"><Input value={f.tireur} onChange={set('tireur')} /></Field>
              {mode === 'cheque_certifie' && <Field label="Date d'émission"><Input type="date" value={f.dateEmission} onChange={set('dateEmission')} /></Field>}
            </>
          )}
          {mode === 'traite' && (
            <>
              <Field label="Référence de la traite"><Input value={f.reference} onChange={set('reference')} /></Field>
              <Field label="Débiteur (tiré)"><Input value={f.tireur} onChange={set('tireur')} /></Field>
              <Field label="Échéance"><Input type="date" value={f.echeance} onChange={set('echeance')} /></Field>
              <Field label="Banque domiciliataire"><Input value={f.banque} onChange={set('banque')} /></Field>
            </>
          )}
        </div>
        {mode === 'especes' && (
          <div className="space-y-1 rounded-lg bg-surface-2 p-3 text-[13px]">
            <div className="flex justify-between"><span>Droit de timbre (barème en vigueur)</span><Money value={timbre} strong /></div>
            <div className="flex justify-between"><span>Total à recevoir en espèces</span><Money value={montant + timbre} strong /></div>
            {!cash?.session && can('caisse.voir') && <p className="text-red">Aucune caisse ouverte : ouvrez la caisse avant d'encaisser des espèces.</p>}
            {depassePlafond && (can('especes.depasser')
              ? <p className="text-amber">Au-delà du plafond espèces de {da(settings.plafond_especes)} : votre accord de gérant sera enregistré dans le journal.</p>
              : <p className="text-red">Au-delà du plafond espèces de {da(settings.plafond_especes)} : un gérant doit enregistrer ce paiement.</p>)}
          </div>
        )}
        {(mode === 'cheque' || mode === 'cheque_certifie') && <p className="text-[13px] text-muted">Le chèque ne comptera comme encaissé qu'après confirmation de la banque (page Chèques et traites).</p>}
        {mode === 'traite' && <p className="text-[13px] text-muted">La traite reste « en portefeuille » jusqu'à son paiement. Une livraison avant l'échéance demande l'accord d'un gérant.</p>}
      </div>
    </Modal>
  );
}

function RemboursementModal({ vente, solde, onClose }: { vente: Vente; solde?: VenteSolde; onClose: () => void }) {
  const toast = useToast();
  const max = solde?.encaisse ?? 0;
  const [montant, setMontant] = useState(0);
  const [mode, setMode] = useState('especes');
  const [motif, setMotif] = useState('');
  const [ref, setRef] = useState('');
  return (
    <Modal open onClose={onClose} title={`Rembourser — ${vente.numero}`} size="sm" footer={
      <>
        <Button onClick={onClose}>Annuler</Button>
        <AsyncButton variant="danger" disabled={montant <= 0 || montant > max || !motif.trim()} onRun={async () => {
          if (await toast.run(() => api.paiementRembourser(vente.id, montant, mode, motif, ref), `Remboursement de ${da(montant)} enregistré`)) onClose();
        }}>Rembourser</AsyncButton>
      </>
    }>
      <div className="space-y-3">
        <p className="text-[13px] text-muted">Montant réellement encaissé à ce jour : {da(max)}</p>
        <Field label="Montant" error={montant > max ? `Maximum ${da(max)}` : undefined}><MoneyInput value={montant} onChange={setMontant} /></Field>
        <Field label="Mode">
          <Select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="especes">Espèces (caisse)</option><option value="cheque">Chèque</option><option value="virement">Virement</option>
          </Select>
        </Field>
        {mode !== 'especes' && <Field label="Référence"><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>}
        <Field label="Motif du remboursement"><Textarea value={motif} onChange={(e) => setMotif(e.target.value)} rows={2} /></Field>
      </div>
    </Modal>
  );
}

// ───────────────────────────── Détail d'une vente ─────────────────────────────

export function StatutActions({ p }: { p: Paiement }) {
  const { can } = useApp();
  const toast = useToast();
  const [rejet, setRejet] = useState<string | null>(null);
  if (!can('paiements.valider')) return null;
  const cheque = (p.mode === 'cheque' || p.mode === 'cheque_certifie') && p.statut === 'en_attente';
  const traite = p.mode === 'traite' && p.statut === 'en_portefeuille';
  if (!cheque && !traite) return null;
  const ok = cheque ? 'encaisse' : 'payee';
  const ko = cheque ? 'rejete' : 'impayee';
  return (
    <span className="inline-flex gap-1">
      <AsyncButton size="sm" onRun={() => toast.run(() => api.paiementStatut(p.id, ok), cheque ? 'Chèque encaissé' : 'Traite payée')}>{cheque ? 'Encaissé' : 'Payée'}</AsyncButton>
      <Button size="sm" variant="ghost" onClick={() => setRejet(ko)}>{cheque ? 'Rejeté' : 'Impayée'}</Button>
      <ConfirmDialog open={rejet !== null} onClose={() => setRejet(null)} danger
        title={cheque ? `Chèque ${p.reference} rejeté` : `Traite ${p.reference} impayée`}
        message={`${da(p.montant)} redeviendront à payer par le client.`}
        confirmLabel="Confirmer" requireReason="Motif (ex. : sans provision)"
        onConfirm={async (m) => { if (await toast.run(() => api.paiementStatut(p.id, ko, m), 'Statut mis à jour')) setRejet(null); }} />
    </span>
  );
}

function VenteDetail({ vente, onClose }: { vente: Vente; onClose: () => void }) {
  const { can, go } = useApp();
  const toast = useToast();
  const clients = useClientsMap();
  const vehicules = useVehiculesMap();
  const soldes = useSoldes();
  const couts = useVenteCouts();
  const paiements = useTable<Paiement>('paiements', { eq: { vente_id: vente.id }, order: { column: 'date' } }) ?? [];
  const solde = soldes.get(vente.id);
  const encaisse = solde?.encaisse ?? 0;
  const reste = resteAPayer(vente, solde);
  const traites = solde?.traites_en_portefeuille ?? 0;
  const cheques = solde?.cheques_en_attente ?? 0;
  const client = clients.get(vente.client_id);
  const vehicule = vehicules.get(vente.vehicule_id);
  const [modal, setModal] = useState<'payer' | 'rembourser' | 'livrer' | 'annuler' | null>(null);
  const [accord, setAccord] = useState(false);
  const [doc, setDoc] = useState<{ kind: DocKind; p?: Paiement } | null>(null);
  const st = STATUT_VENTE[vente.statut];
  const livrable = vente.statut === 'confirmee' && (reste <= 0 || (cheques === 0 && traites >= reste));
  const avecTraite = reste > 0 && traites >= reste;

  const ouvrirFacture = async () => {
    if (vente.facture_numero) { setDoc({ kind: 'facture' }); return; }
    if (await toast.run(() => api.venteFacturer(vente.id))) setDoc({ kind: 'facture' });
  };

  return (
    <Modal open onClose={onClose} title={`Vente ${vente.numero}`} size="lg" footer={
      <>
        <Button icon={<FileText className="h-4 w-4" />} onClick={() => setDoc({ kind: 'contrat' })}>Contrat</Button>
        {vente.statut !== 'annulee' && (vente.facture_numero || can('ventes.facturer')) && (
          <Button icon={<FileSpreadsheet className="h-4 w-4" />} onClick={ouvrirFacture}>{vente.facture_numero ? `Facture ${vente.facture_numero}` : 'Émettre la facture'}</Button>
        )}
        {vente.statut === 'livree' && <Button icon={<Printer className="h-4 w-4" />} onClick={() => setDoc({ kind: 'bon_sortie' })}>Bon de sortie</Button>}
        {vente.statut === 'confirmee' && can('ventes.annuler') && <Button icon={<Ban className="h-4 w-4" />} onClick={() => setModal('annuler')}>Annuler la vente</Button>}
        {vente.statut === 'confirmee' && encaisse > 0 && can('paiements.rembourser') && <Button icon={<Undo2 className="h-4 w-4" />} onClick={() => setModal('rembourser')}>Rembourser</Button>}
        {vente.statut !== 'annulee' && reste - traites - cheques > 0 && can('paiements.encaisser') && <Button variant="primary" icon={<Wallet className="h-4 w-4" />} onClick={() => setModal('payer')}>Enregistrer un paiement</Button>}
        {livrable && can('ventes.livrer') && <Button variant="primary" icon={<Truck className="h-4 w-4" />} onClick={() => { setAccord(false); setModal('livrer'); }}>Livrer</Button>}
      </>
    }>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={st.tone}>{st.label}</Badge>
        {vente.statut !== 'annulee' && (reste > 0 ? <Badge tone="amber">Reste {da(reste)}</Badge> : <Badge tone="green">Soldée</Badge>)}
        {cheques > 0 && <Badge tone="amber">{da(cheques)} en chèque(s) à confirmer</Badge>}
        {traites > 0 && <Badge tone="blue">{da(traites)} en traite(s)</Badge>}
        {vente.livraison_accord_par && <Badge tone="blue">Livrée avec traite — accord {vente.livraison_accord_par}</Badge>}
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <KeyValue items={[
          ['Date', dateTime(vente.date)],
          ['Client', client ? <button className="text-brand underline-offset-2 hover:underline" onClick={() => go('clients', { open: client.id })}>{client.nom}</button> : '—'],
          ['Téléphone', client?.telephone || '—'],
          ['Véhicule', vehicule ? <button className="text-start text-brand underline-offset-2 hover:underline" onClick={() => go('vehicules', { open: vehicule.id })}>{vente.vehicule_libelle}</button> : vente.vehicule_libelle],
          ['VIN', vente.vehicule_vin || '—'],
          ['Conseiller', vente.commercial_nom],
          ['Saisie du prix', MODE_PRIX_LABELS[vente.mode_prix].titre],
        ]} />
        <KeyValue items={[
          ['Prix affiché HT', <Money key="c" value={vente.prix_catalogue_ht} />],
          ...(vente.remise_ht > 0 ? [['Remise HT', <Money key="r" value={vente.remise_ht} />] as [string, React.ReactNode]] : []),
          ['Total HT', <Money key="h" value={vente.montant_ht} />],
          [vente.mode_prix === 'direct' ? 'TVA' : vente.taux_tva !== null ? `TVA ${Number(vente.taux_tva)} %` : 'TVA (montants saisis)', vente.mode_prix === 'direct' ? 'non détaillée' : <Money key="t" value={vente.montant_tva} />],
          ['Total TTC', <Money key="ttc" value={vente.montant_ttc} strong />],
          ['Encaissé', <Money key="e" value={encaisse} />],
          ['Reste à payer', <Money key="s" value={reste} strong />],
          ...(can('couts.voir') && couts.has(vente.id) ? [['Marge estimée HT', <Money key="m" value={vente.montant_ht - (couts.get(vente.id) ?? 0)} />] as [string, React.ReactNode]] : []),
        ]} />
      </div>
      {vente.statut === 'annulee' && <p className="mt-4 rounded-lg bg-red-soft p-3 text-[13px] text-red">Annulée le {dateTime(vente.annulation_date)} par {vente.annulation_par} : {vente.annulation_motif}</p>}
      {vente.notes && <p className="mt-4 rounded-lg bg-surface-2 p-3 text-[13px]">{vente.notes}</p>}

      <h3 className="mb-2 mt-6 font-semibold">Paiements</h3>
      {paiements.length === 0 ? <p className="text-muted">Aucun paiement enregistré.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]"><tbody>
            {paiements.map((p) => (
              <tr key={p.id} className="border-b border-line align-top last:border-0">
                <td className="py-2 pe-2 whitespace-nowrap">{date(p.date)}</td>
                <td className="py-2 pe-2">
                  <div>{p.sens === 'remboursement' ? 'Remboursement' : MODE_LABELS[p.mode]} <span className="text-muted">· {p.numero}</span></div>
                  <div className="text-xs text-muted">
                    {[p.banque, p.reference && `n° ${p.reference}`, p.tireur, p.echeance && `échéance ${date(p.echeance)}`, p.motif].filter(Boolean).join(' · ')}
                  </div>
                </td>
                <td className="py-2 pe-2"><Badge tone={STATUT_PAIEMENT[p.statut].tone}>{STATUT_PAIEMENT[p.statut].label}</Badge></td>
                <td className="py-2 pe-2 text-end whitespace-nowrap">
                  {p.sens === 'remboursement' ? <span className="text-red">− {da(p.montant)}</span> : <Money value={p.montant} />}
                  {p.droit_timbre > 0 && <div className="text-xs text-muted">+ timbre {da(p.droit_timbre)}</div>}
                </td>
                <td className="py-2 text-end whitespace-nowrap">
                  <StatutActions p={p} />
                  {p.sens === 'encaissement' && <button className="ms-2 text-brand hover:underline" onClick={() => setDoc({ kind: 'recu', p })}>Reçu</button>}
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      {modal === 'payer' && <PaiementModal vente={vente} solde={solde} onClose={() => setModal(null)} />}
      {modal === 'rembourser' && <RemboursementModal vente={vente} solde={solde} onClose={() => setModal(null)} />}
      {doc && <DocumentModal kind={doc.kind} vente={vente} client={client} vehicule={vehicule} paiement={doc.p} paiements={paiements} solde={solde} onClose={() => setDoc(null)} />}
      <ConfirmDialog
        open={modal === 'livrer'}
        onClose={() => setModal(null)}
        title="Livrer le véhicule"
        message={avecTraite ? (
          <div className="space-y-3">
            <p>Le reste à payer ({da(reste)}) est couvert par des traites non échues. La livraison demande l'accord d'un gérant, qui sera enregistré.</p>
            {can('livraison.accord')
              ? <label className="flex items-start gap-2"><input type="checkbox" checked={accord} onChange={(e) => setAccord(e.target.checked)} className="mt-1" /> J'autorise la livraison avant le paiement des traites.</label>
              : <p className="text-red">Votre profil ne permet pas de donner cet accord : demandez à un gérant.</p>}
          </div>
        ) : 'Le véhicule sort du parc et un bon de sortie numéroté est émis. Cette opération est définitive.'}
        confirmLabel="Confirmer la livraison"
        onConfirm={async () => {
          if (avecTraite && !accord) { toast.error("Cochez l'accord de livraison avec traite."); return; }
          let bs = '';
          const ok = await toast.run(async () => { bs = await api.venteLivrer(vente.id, avecTraite && accord); });
          if (ok) { toast.success(`Bon de sortie ${bs} émis`); setModal(null); setDoc({ kind: 'bon_sortie' }); }
        }}
      />
      <ConfirmDialog
        open={modal === 'annuler'}
        onClose={() => setModal(null)}
        title="Annuler la vente"
        danger
        message={encaisse > 0 ? `${da(encaisse)} ont été encaissés : remboursez-les d'abord, puis annulez.`
          : cheques + traites > 0 ? 'Des chèques ou traites sont en cours : marquez-les rejetés ou impayés d’abord.'
            : 'Le véhicule redeviendra disponible. La vente reste visible avec le statut « Annulée ».'}
        confirmLabel="Annuler la vente"
        requireReason="Motif d'annulation"
        onConfirm={async (r) => { if (await toast.run(() => api.venteAnnuler(vente.id, r), 'Vente annulée')) setModal(null); }}
      />
    </Modal>
  );
}

// ───────────────────────────── Liste ─────────────────────────────

type Filtre = 'tous' | 'confirmee' | 'a_livrer' | 'impayees' | 'livree' | 'annulee';

export function VentesPage() {
  const { can, route, go } = useApp();
  const clients = useClientsMap();
  const ventes = useTable<Vente>('ventes');
  const soldes = useSoldes();
  const couts = useVenteCouts();
  const [filtre, setFiltre] = useState<Filtre>((route.params.filtre as Filtre) || 'tous');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => { if (route.params.filtre) setFiltre(route.params.filtre as Filtre); }, [route.params.filtre]);

  const rows = useMemo(() => (ventes ?? []).filter((v) => {
    const d = v.date.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    const reste = resteAPayer(v, soldes.get(v.id));
    switch (filtre) {
      case 'tous': return true;
      case 'a_livrer': return v.statut === 'confirmee' && reste <= 0;
      case 'impayees': return v.statut === 'confirmee' && reste > 0;
      default: return v.statut === filtre;
    }
  }), [ventes, filtre, soldes, from, to]);

  const opened = route.params.open ? ventes?.find((v) => v.id === route.params.open) : undefined;
  const closeParams = () => go('ventes', filtre !== 'tous' ? { filtre } : {});

  const columns: Column<Vente>[] = [
    { key: 'numero', header: 'N°', sortValue: (v) => v.numero, render: (v) => <span className="font-medium">{v.numero}</span> },
    { key: 'date', header: 'Date', sortValue: (v) => v.date, render: (v) => date(v.date) },
    { key: 'client', header: 'Client', sortValue: (v) => clients.get(v.client_id)?.nom ?? '', render: (v) => clients.get(v.client_id)?.nom ?? '—' },
    { key: 'veh', header: 'Véhicule', render: (v) => v.vehicule_libelle, hideOnMobile: true },
    { key: 'total', header: 'Total TTC', align: 'end', sortValue: (v) => v.montant_ttc, render: (v) => <Money value={v.montant_ttc} /> },
    { key: 'reste', header: 'Reste', align: 'end', sortValue: (v) => resteAPayer(v, soldes.get(v.id)), render: (v) => {
      if (v.statut === 'annulee') return <span className="text-muted">—</span>;
      const r = resteAPayer(v, soldes.get(v.id));
      return r > 0 ? <Money value={r} className="text-amber" /> : <span className="text-green">Soldée</span>;
    } },
    { key: 'statut', header: 'Statut', sortValue: (v) => v.statut, render: (v) => <Badge tone={STATUT_VENTE[v.statut].tone}>{STATUT_VENTE[v.statut].label}</Badge> },
  ];

  const exportCsv = () => downloadCsv(`ventes-${toInputDate(Date.now())}.csv`, [
    ['N°', 'Date', 'Client', 'Véhicule', 'VIN', 'Prix affiché HT', 'Remise HT', 'Total HT', 'TVA', 'Total TTC', 'Encaissé', 'Reste', 'Statut', 'Facture', 'Conseiller', ...(can('couts.voir') ? ['Coût de revient', 'Marge HT'] : [])],
    ...rows.map((v) => {
      const s = soldes.get(v.id);
      return [v.numero, date(v.date), clients.get(v.client_id)?.nom ?? '', v.vehicule_libelle, v.vehicule_vin, v.prix_catalogue_ht, v.remise_ht, v.montant_ht, v.montant_tva, v.montant_ttc,
        s?.encaisse ?? 0, resteAPayer(v, s), STATUT_VENTE[v.statut].label, v.facture_numero ?? '', v.commercial_nom,
        ...(can('couts.voir') ? [couts.get(v.id) ?? 0, v.statut === 'annulee' ? 0 : v.montant_ht - (couts.get(v.id) ?? 0)] : [])];
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Ventes"
        description="Contrats, factures, paiements, livraisons et annulations."
        actions={
          <>
            <Button icon={<Download className="h-4 w-4" />} onClick={exportCsv}>Exporter CSV</Button>
            {can('ventes.creer') && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => go('ventes', { nouvelle: '1' })}>Nouvelle vente</Button>}
          </>
        }
      />
      <DataTable
        rows={ventes ? rows : undefined}
        columns={columns}
        rowKey={(v) => v.id}
        initialSort={{ key: 'date', dir: 'desc' }}
        searchText={(v) => `${v.numero} ${clients.get(v.client_id)?.nom ?? ''} ${v.vehicule_libelle} ${v.vehicule_vin} ${v.facture_numero ?? ''}`}
        searchPlaceholder="N°, client, véhicule, facture…"
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
            {(from || to)
              ? <Button size="sm" variant="ghost" onClick={() => { setFrom(''); setTo(''); }}>Effacer les dates</Button>
              : <Button size="sm" variant="ghost" onClick={() => setFrom(toInputDate(startOfMonth()))}>Ce mois-ci</Button>}
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
        <NouvelleVente presetVehicule={route.params.vehicule} presetClient={route.params.client} onClose={(id) => (id ? go('ventes', { open: id }) : closeParams())} />
      )}
      {opened && <VenteDetail vente={opened} onClose={closeParams} />}
    </div>
  );
}
