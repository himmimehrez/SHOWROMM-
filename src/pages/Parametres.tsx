import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Download } from 'lucide-react';
import { useApp } from '../app-context';
import { db } from '../lib/db';
import * as S from '../lib/services';
import { isDemoLoaded, loadDemoData, resetBusinessData } from '../lib/demo';
import { toInputDate } from '../lib/format';
import type { Depot } from '../lib/types';
import { AsyncButton, Badge, Button, ConfirmDialog, Field, Input, Modal, MoneyInput, PageHeader, Panel, Textarea } from '../components/ui';
import { useToast } from '../components/toast';

function DepotModal({ initial, onClose }: { initial?: Depot; onClose: () => void }) {
  const { user } = useApp();
  const toast = useToast();
  const [f, setF] = useState({ code: initial?.code ?? '', nom: initial?.nom ?? '', adresse: initial?.adresse ?? '', responsable: initial?.responsable ?? '', actif: initial?.actif ?? true });
  return (
    <Modal open onClose={onClose} title={initial ? `Dépôt ${initial.code}` : 'Nouveau dépôt'} size="sm" footer={
      <>
        <Button onClick={onClose}>Annuler</Button>
        <AsyncButton variant="primary" onRun={async () => { if (await toast.run(() => S.saveDepot(user, { ...f, id: initial?.id }), 'Dépôt enregistré')) onClose(); }}>Enregistrer</AsyncButton>
      </>
    }>
      <div className="grid gap-3">
        <Field label="Code court" hint="Ex. : SHW, PARC, PORT"><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} maxLength={8} /></Field>
        <Field label="Nom"><Input value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /></Field>
        <Field label="Adresse"><Input value={f.adresse} onChange={(e) => setF({ ...f, adresse: e.target.value })} /></Field>
        <Field label="Responsable"><Input value={f.responsable} onChange={(e) => setF({ ...f, responsable: e.target.value })} /></Field>
        {initial && <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={f.actif} onChange={(e) => setF({ ...f, actif: e.target.checked })} /> Dépôt actif</label>}
      </div>
    </Modal>
  );
}

export function ParametresPage() {
  const { user, settings } = useApp();
  const toast = useToast();
  const depots = useLiveQuery(() => db.depots.toArray(), []) ?? [];
  const demo = useLiveQuery(() => isDemoLoaded(), []);
  const [s, setS] = useState(settings);
  const [cats, setCats] = useState(settings.categories_depenses.join('\n'));
  const [depot, setDepot] = useState<Depot | 'new' | null>(null);
  const [reset, setReset] = useState(false);

  useEffect(() => { setS(settings); setCats(settings.categories_depenses.join('\n')); }, [settings]);

  const exportBackup = async () => {
    await toast.run(async () => {
      const data = await S.exportBackup(user);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `sauvegarde-showroom-${toInputDate(Date.now())}.json`;
      a.click();
    }, 'Sauvegarde téléchargée');
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Paramètres" description="Informations du showroom, règles commerciales, dépôts et données." />

      <Panel title="Showroom" actions={
        <AsyncButton variant="primary" size="sm" onRun={() => toast.run(() => S.saveSettings(user, { ...s, categories_depenses: cats.split('\n') }), 'Paramètres enregistrés')}>Enregistrer</AsyncButton>
      }>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid gap-3">
            <Field label="Nom du showroom"><Input value={s.nom} onChange={(e) => setS({ ...s, nom: e.target.value })} /></Field>
            <Field label="Adresse"><Input value={s.adresse} onChange={(e) => setS({ ...s, adresse: e.target.value })} /></Field>
            <Field label="Téléphone"><Input value={s.telephone} onChange={(e) => setS({ ...s, telephone: e.target.value })} /></Field>
            <Field label="NIF / NIS / RC" hint="Affiché sur les documents"><Input value={s.nif_rc} onChange={(e) => setS({ ...s, nif_rc: e.target.value })} /></Field>
            <Field label="Mentions en bas des documents" hint="À faire valider avant la mise en service"><Textarea value={s.mentions} onChange={(e) => setS({ ...s, mentions: e.target.value })} rows={3} /></Field>
          </div>
          <div className="grid content-start gap-3">
            <Field label="Remise maximale sans autorisation" hint="Au-delà, seul un gérant ou un administrateur peut valider la vente"><MoneyInput value={s.remise_max_commercial} onChange={(n) => setS({ ...s, remise_max_commercial: n })} /></Field>
            <Field label="Catégories de dépenses" hint="Une par ligne"><Textarea value={cats} onChange={(e) => setCats(e.target.value)} rows={9} /></Field>
          </div>
        </div>
      </Panel>

      <Panel title="Dépôts" actions={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setDepot('new')}>Ajouter un dépôt</Button>} padded={false}>
        <div className="divide-y divide-line">
          {depots.map((d) => (
            <button key={d.id} onClick={() => setDepot(d)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start hover:bg-surface-2">
              <span><span className="font-medium">{d.nom}</span> <span className="text-muted">· {d.code}{d.responsable ? ` · ${d.responsable}` : ''}</span></span>
              {d.actif ? <Badge tone="green">Actif</Badge> : <Badge>Inactif</Badge>}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Données">
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <div className="font-medium">Sauvegarde</div>
            <p className="mt-1 text-[13px] text-muted">Les données sont enregistrées dans ce navigateur, sur ce poste. Téléchargez une sauvegarde régulièrement.</p>
            <Button className="mt-3" icon={<Download className="h-4 w-4" />} onClick={exportBackup}>Télécharger une sauvegarde</Button>
          </div>
          {user.role === 'admin' && (
            <div>
              <div className="font-medium">Données de démonstration</div>
              <p className="mt-1 text-[13px] text-muted">Ajoute des véhicules, clients, une commande et deux ventes fictives, signalés par un bandeau, pour découvrir l'application.</p>
              <AsyncButton className="mt-3" disabled={Boolean(demo)} onRun={() => toast.run(() => loadDemoData(user), 'Données de démonstration chargées')}>
                {demo ? 'Déjà chargées' : 'Charger la démonstration'}
              </AsyncButton>
            </div>
          )}
          {user.role === 'admin' && (
            <div>
              <div className="font-medium">Repartir de zéro</div>
              <p className="mt-1 text-[13px] text-muted">Efface véhicules, clients, ventes, caisse et dépenses. Les comptes, les paramètres et le journal d'audit sont conservés.</p>
              <Button className="mt-3" variant="danger" onClick={() => setReset(true)}>Effacer les données</Button>
            </div>
          )}
        </div>
      </Panel>

      {depot && <DepotModal initial={depot === 'new' ? undefined : depot} onClose={() => setDepot(null)} />}
      <ConfirmDialog
        open={reset}
        onClose={() => setReset(false)}
        title="Effacer toutes les données métier"
        danger
        message="Cette opération est définitive. Téléchargez une sauvegarde avant si vous avez saisi des données réelles."
        confirmLabel="Effacer définitivement"
        requireReason="Tapez EFFACER pour confirmer"
        onConfirm={async (r) => {
          if (r !== 'EFFACER') { toast.error('Tapez EFFACER en majuscules pour confirmer.'); return; }
          if (await toast.run(() => resetBusinessData(user), 'Données effacées')) setReset(false);
        }}
      />
    </div>
  );
}
