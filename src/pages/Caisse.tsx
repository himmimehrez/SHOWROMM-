import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Wallet, ArrowDownLeft, ArrowUpRight, Lock } from 'lucide-react';
import { useApp } from '../app-context';
import { db } from '../lib/db';
import { useOpenCash } from '../lib/hooks';
import * as S from '../lib/services';
import { da, dateTime, downloadCsv, toInputDate } from '../lib/format';
import { TYPE_MVT_CAISSE } from '../lib/labels';
import type { CaisseMouvement, CaisseSession } from '../lib/types';
import { DataTable, type Column } from '../components/DataTable';
import { AsyncButton, Badge, Button, EmptyState, Field, Input, Modal, Money, MoneyInput, PageHeader, Panel, Textarea, cx } from '../components/ui';
import { useToast } from '../components/toast';

function OpenCash() {
  const { user } = useApp();
  const toast = useToast();
  const last = useLiveQuery(() => db.caisse_sessions.orderBy('ouverture').last(), []);
  const [fonds, setFonds] = useState<number | null>(null);
  const value = fonds ?? last?.compte ?? 0;
  return (
    <Panel>
      <div className="mx-auto max-w-md py-6 text-center">
        <Wallet className="mx-auto h-8 w-8 text-muted" />
        <h2 className="mt-3 text-lg font-semibold">La caisse est fermée</h2>
        <p className="mt-1 text-muted">Comptez les espèces présentes dans le tiroir et saisissez le fonds de départ.{last ? ` Dernière clôture : ${da(last.compte)} comptés.` : ''}</p>
        <div className="mt-5 text-start">
          <Field label="Fonds de caisse initial"><MoneyInput value={value} onChange={setFonds} /></Field>
        </div>
        <AsyncButton variant="primary" size="lg" className="mt-4 w-full" onRun={() => toast.run(() => S.ouvrirCaisse(user, value), 'Caisse ouverte')}>
          Ouvrir la caisse
        </AsyncButton>
      </div>
    </Panel>
  );
}

function MouvementModal({ type, onClose, dispo }: { type: 'apport' | 'retrait'; onClose: () => void; dispo: number }) {
  const { user } = useApp();
  const toast = useToast();
  const [montant, setMontant] = useState(0);
  const [motif, setMotif] = useState('');
  return (
    <Modal open onClose={onClose} title={type === 'apport' ? 'Apport en caisse' : 'Retrait de caisse'} size="sm" footer={
      <>
        <Button onClick={onClose}>Annuler</Button>
        <AsyncButton variant="primary" disabled={montant <= 0 || !motif.trim() || (type === 'retrait' && montant > dispo)} onRun={async () => {
          if (await toast.run(() => S.apportRetrait(user, type, montant, motif), type === 'apport' ? 'Apport enregistré' : 'Retrait enregistré')) onClose();
        }}>{type === 'apport' ? "Enregistrer l'apport" : 'Enregistrer le retrait'}</AsyncButton>
      </>
    }>
      <div className="space-y-3">
        <Field label="Montant" error={type === 'retrait' && montant > dispo ? `Il n'y a que ${da(dispo)} en caisse.` : undefined}><MoneyInput value={montant} onChange={setMontant} /></Field>
        <Field label="Motif"><Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder={type === 'apport' ? 'Ex. : appoint de monnaie' : 'Ex. : dépôt à la banque'} /></Field>
      </div>
    </Modal>
  );
}

function ClotureModal({ session, theorique, onClose }: { session: CaisseSession; theorique: number; onClose: () => void }) {
  const { user } = useApp();
  const toast = useToast();
  const [compte, setCompte] = useState(0);
  const [touched, setTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const ecart = compte - theorique;
  return (
    <Modal open onClose={onClose} title={`Clôturer la caisse ${session.numero}`} size="sm" footer={
      <>
        <Button onClick={onClose}>Annuler</Button>
        <AsyncButton variant="primary" disabled={!touched || (ecart !== 0 && !notes.trim())} onRun={async () => {
          if (await toast.run(() => S.cloturerCaisse(user, compte, notes), ecart === 0 ? 'Caisse clôturée sans écart' : `Caisse clôturée avec un écart de ${da(ecart)}`)) onClose();
        }}>Clôturer</AsyncButton>
      </>
    }>
      <div className="space-y-4">
        <div className="rounded-lg bg-surface-2 p-3">
          <div className="text-[13px] text-muted">Montant théorique en espèces</div>
          <div className="text-xl font-semibold tabular-nums">{da(theorique)}</div>
        </div>
        <Field label="Montant réellement compté"><MoneyInput value={compte} onChange={(n) => { setCompte(n); setTouched(true); }} /></Field>
        {touched && (
          <div className={cx('rounded-lg p-3 text-[13px]', ecart === 0 ? 'bg-green-soft text-green' : 'bg-amber-soft text-amber')}>
            {ecart === 0 ? 'Aucun écart.' : `Écart : ${ecart > 0 ? '+' : ''}${da(ecart)} (${ecart > 0 ? 'excédent' : 'manquant'})`}
          </div>
        )}
        <Field label={ecart !== 0 && touched ? "Explication de l'écart (obligatoire)" : 'Observations'}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
        <p className="text-xs text-muted">Une session clôturée ne peut plus être modifiée.</p>
      </div>
    </Modal>
  );
}

export function CaissePage() {
  const cash = useOpenCash();
  const mouvements = useLiveQuery(
    () => (cash?.session ? db.caisse_mouvements.where('session_id').equals(cash.session.id).toArray() : Promise.resolve([] as CaisseMouvement[])),
    [cash?.session?.id],
  );
  const sessions = useLiveQuery(() => db.caisse_sessions.where('statut').equals('cloturee').toArray(), []);
  const [modal, setModal] = useState<'apport' | 'retrait' | 'cloture' | null>(null);

  const entrees = (mouvements ?? []).filter((m) => m.sens === 'in').reduce((s, m) => s + m.montant, 0);
  const sorties = (mouvements ?? []).filter((m) => m.sens === 'out').reduce((s, m) => s + m.montant, 0);

  const mvtColumns: Column<CaisseMouvement>[] = [
    { key: 'date', header: 'Heure', sortValue: (m) => m.date, render: (m) => dateTime(m.date) },
    { key: 'type', header: 'Opération', render: (m) => TYPE_MVT_CAISSE[m.type] },
    { key: 'motif', header: 'Détail', render: (m) => <span>{m.motif}{m.ref ? <span className="text-muted"> · {m.ref}</span> : null}</span>, hideOnMobile: true },
    { key: 'user', header: 'Par', render: (m) => m.user, hideOnMobile: true },
    { key: 'montant', header: 'Montant', align: 'end', sortValue: (m) => (m.sens === 'in' ? m.montant : -m.montant), render: (m) => (
      <span className={cx('inline-flex items-center gap-1 whitespace-nowrap tabular-nums', m.sens === 'in' ? 'text-green' : 'text-red')}>
        {m.sens === 'in' ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
        {m.sens === 'in' ? '+' : '−'} {da(m.montant)}
      </span>
    ) },
  ];

  const sessColumns: Column<CaisseSession>[] = [
    { key: 'numero', header: 'Session', sortValue: (s) => s.numero, render: (s) => <span className="font-medium">{s.numero}</span> },
    { key: 'ouv', header: 'Ouverture', sortValue: (s) => s.ouverture, render: (s) => <span>{dateTime(s.ouverture)}<span className="block text-xs text-muted">{s.ouverte_par}</span></span> },
    { key: 'clo', header: 'Clôture', sortValue: (s) => s.cloture, render: (s) => <span>{dateTime(s.cloture)}<span className="block text-xs text-muted">{s.cloturee_par}</span></span>, hideOnMobile: true },
    { key: 'fonds', header: 'Fonds initial', align: 'end', render: (s) => <Money value={s.fonds_initial} />, hideOnMobile: true },
    { key: 'theo', header: 'Théorique', align: 'end', render: (s) => <Money value={s.theorique} /> },
    { key: 'compte', header: 'Compté', align: 'end', render: (s) => <Money value={s.compte} /> },
    { key: 'ecart', header: 'Écart', align: 'end', sortValue: (s) => s.ecart, render: (s) => s.ecart === 0 ? <Badge tone="green">0</Badge> : <span title={s.notes}><Badge tone={s.ecart < 0 ? 'red' : 'amber'}>{s.ecart > 0 ? '+' : ''}{da(s.ecart)}</Badge></span> },
  ];

  if (!cash) return <div className="text-muted">Chargement…</div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Caisse" description="Espèces uniquement : chèques, virements et cartes n'entrent pas dans le tiroir." />

      {!cash.session ? <OpenCash /> : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
          <div className="rounded-xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted">Session {cash.session.numero}</span>
              <Badge tone="green">Ouverte</Badge>
            </div>
            <div className="mt-4 text-[13px] text-muted">Espèces attendues dans le tiroir</div>
            <div className="mt-1 text-[34px] font-semibold leading-none tracking-tight tabular-nums">{da(cash.solde)}</div>
            <dl className="mt-5 space-y-1.5 text-[13px]">
              <div className="flex justify-between"><dt className="text-muted">Fonds initial</dt><dd><Money value={cash.session.fonds_initial} /></dd></div>
              <div className="flex justify-between"><dt className="text-muted">Entrées</dt><dd className="text-green">+ {da(entrees)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Sorties</dt><dd className="text-red">− {da(sorties)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Ouverte</dt><dd>{dateTime(cash.session.ouverture)} par {cash.session.ouverte_par}</dd></div>
            </dl>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button icon={<ArrowDownLeft className="h-4 w-4" />} onClick={() => setModal('apport')}>Apport</Button>
              <Button icon={<ArrowUpRight className="h-4 w-4" />} onClick={() => setModal('retrait')}>Retrait</Button>
              <Button variant="primary" className="col-span-2" icon={<Lock className="h-4 w-4" />} onClick={() => setModal('cloture')}>Clôturer la caisse</Button>
            </div>
          </div>
          <div>
            <h2 className="mb-2 font-semibold">Mouvements de la session</h2>
            <DataTable
              rows={mouvements}
              columns={mvtColumns}
              rowKey={(m) => m.id}
              initialSort={{ key: 'date', dir: 'desc' }}
              pageSize={10}
              empty={<EmptyState title="Aucun mouvement depuis l'ouverture" text="Les encaissements en espèces, dépenses et paiements fournisseurs réglés en espèces apparaîtront ici." />}
            />
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Sessions clôturées</h2>
          {sessions && sessions.length > 0 && (
            <Button size="sm" onClick={() => downloadCsv(`sessions-caisse-${toInputDate(Date.now())}.csv`, [
              ['Session', 'Ouverture', 'Ouverte par', 'Clôture', 'Clôturée par', 'Fonds initial', 'Théorique', 'Compté', 'Écart', 'Observations'],
              ...sessions.map((s) => [s.numero, dateTime(s.ouverture), s.ouverte_par, dateTime(s.cloture), s.cloturee_par, s.fonds_initial, s.theorique, s.compte, s.ecart, s.notes]),
            ])}>Exporter CSV</Button>
          )}
        </div>
        <DataTable rows={sessions} columns={sessColumns} rowKey={(s) => s.id} initialSort={{ key: 'ouv', dir: 'desc' }} pageSize={10}
          empty={<EmptyState title="Aucune session clôturée" />} />
      </div>

      {cash.session && (modal === 'apport' || modal === 'retrait') && <MouvementModal type={modal} dispo={cash.solde} onClose={() => setModal(null)} />}
      {cash.session && modal === 'cloture' && <ClotureModal session={cash.session} theorique={cash.solde} onClose={() => setModal(null)} />}
    </div>
  );
}
