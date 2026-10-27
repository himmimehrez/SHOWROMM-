import React, { useEffect, useState } from 'react';
import { Plus, Download } from 'lucide-react';
import { useApp } from '../app-context';
import { getBackend } from '../lib/data';
import { api } from '../lib/api';
import { useDepots } from '../lib/hooks';
import { da, toInputDate } from '../lib/format';
import type { Depot, ShopSettings, TimbreTranche } from '../lib/types';
import { AsyncButton, Badge, Button, Field, Input, Modal, MoneyInput, PageHeader, Panel, Textarea } from '../components/ui';
import { useToast } from '../components/toast';

function DepotModal({ initial, onClose }: { initial?: Depot; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ code: initial?.code ?? '', nom: initial?.nom ?? '', adresse: initial?.adresse ?? '', responsable: initial?.responsable ?? '', actif: initial?.actif ?? true });
  return (
    <Modal open onClose={onClose} title={initial ? `Dépôt ${initial.code}` : 'Nouveau dépôt'} size="sm" footer={
      <>
        <Button onClick={onClose}>Annuler</Button>
        <AsyncButton variant="primary" onRun={async () => { if (await toast.run(() => api.depotSave({ ...f, id: initial?.id }), 'Dépôt enregistré')) onClose(); }}>Enregistrer</AsyncButton>
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

const TABLES_SAUVEGARDE = ['settings', 'depots', 'profiles', 'fournisseurs', 'vehicules', 'vehicule_couts', 'mouvements', 'achats', 'achat_lignes',
  'paiements_fournisseurs', 'clients', 'interactions', 'ventes', 'vente_couts', 'paiements', 'caisse_sessions', 'caisse_mouvements', 'depenses', 'audit_logs'];

export function ParametresPage() {
  const { settings } = useApp();
  const toast = useToast();
  const { depots } = useDepots();
  const [s, setS] = useState<ShopSettings>(settings);
  const [cats, setCats] = useState(settings.categories_depenses.join('\n'));
  const [depot, setDepot] = useState<Depot | 'new' | null>(null);
  useEffect(() => { setS(settings); setCats(settings.categories_depenses.join('\n')); }, [settings]);
  const set = <K extends keyof ShopSettings>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setS({ ...s, [k]: e.target.value });
  const setTranche = (i: number, patch: Partial<TimbreTranche>) => setS({ ...s, timbre: { ...s.timbre, tranches: s.timbre.tranches.map((t, j) => (j === i ? { ...t, ...patch } : t)) } });

  const save = () => toast.run(() => api.settingsSave({ ...s, categories_depenses: cats.split('\n').map((c) => c.trim()).filter(Boolean) }), 'Paramètres enregistrés');

  const exportBackup = () => toast.run(async () => {
    const b = getBackend();
    const data: Record<string, unknown[]> = {};
    for (const t of TABLES_SAUVEGARDE) data[t] = await b.select(t, { limit: 5000 });
    const blob = new Blob([JSON.stringify({ app: 'showroom-manager-dz', exported_at: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `export-showroom-${toInputDate(Date.now())}.json`;
    a.click();
  }, 'Export téléchargé');

  return (
    <div className="space-y-6">
      <PageHeader title="Paramètres" description="Identité du showroom, mentions des documents, règles commerciales et fiscales, dépôts." actions={<AsyncButton variant="primary" onRun={save}>Enregistrer les paramètres</AsyncButton>} />

      <Panel title="Identité du showroom (affichée sur les documents)">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Raison sociale / nom commercial"><Input value={s.nom} onChange={set('nom')} /></Field>
          <Field label="Forme juridique"><Input value={s.forme_juridique} onChange={set('forme_juridique')} placeholder="SARL, EURL, SPA, personne physique…" /></Field>
          <Field label="Capital social"><Input value={s.capital} onChange={set('capital')} placeholder="Ex. : 1 000 000 DA" /></Field>
          <Field label="Activité"><Input value={s.activite} onChange={set('activite')} /></Field>
          <Field label="Adresse" className="lg:col-span-2"><Input value={s.adresse} onChange={set('adresse')} /></Field>
          <Field label="Téléphone"><Input value={s.telephone} onChange={set('telephone')} /></Field>
          <Field label="E-mail"><Input value={s.email} onChange={set('email')} /></Field>
          <div className="hidden lg:block" />
          <Field label="N° RC"><Input value={s.rc} onChange={set('rc')} /></Field>
          <Field label="NIF"><Input value={s.nif} onChange={set('nif')} /></Field>
          <Field label="NIS"><Input value={s.nis} onChange={set('nis')} /></Field>
          <Field label="Article d'imposition"><Input value={s.article_imposition} onChange={set('article_imposition')} /></Field>
          <Field label="Mentions en bas des documents" hint="À faire valider par le comptable avant la mise en service" className="sm:col-span-2"><Textarea value={s.mentions} onChange={set('mentions')} rows={3} /></Field>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Règles commerciales">
          <div className="grid gap-3">
            <Field label="Remise maximale sans autorisation (HT)" hint="Au-delà, seul un gérant ou un administrateur peut valider la vente"><MoneyInput value={s.remise_max_commercial} onChange={(n) => setS({ ...s, remise_max_commercial: n })} /></Field>
            <Field label="Catégories de dépenses" hint="Une par ligne"><Textarea value={cats} onChange={(e) => setCats(e.target.value)} rows={8} /></Field>
          </div>
        </Panel>

        <Panel title="Règles fiscales">
          <div className="grid gap-4">
            <Field label="Taux de TVA proposés (%)" hint="Séparés par des virgules, ex. : 0, 9, 19">
              <Input value={s.taux_tva.join(', ')} onChange={(e) => setS({ ...s, taux_tva: e.target.value.split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x)) })} />
            </Field>
            <Field label="Plafond des paiements en espèces par vente" hint="Au-delà, l'accord d'un gérant est demandé et tracé. 0 = pas de plafond"><MoneyInput value={s.plafond_especes} onChange={(n) => setS({ ...s, plafond_especes: n })} /></Field>
            <div>
              <div className="mb-1 text-[13px] font-medium">Droit de timbre sur paiement en espèces</div>
              <p className="mb-2 text-xs text-muted">Par tranche de 100 DA entamée, selon le montant. Exemple avec le barème actuel : 1 000 000 DA en espèces donnent {da(Math.ceil(1_000_000 / 100) * (s.timbre.tranches.at(-1)?.par_100 ?? 0))} de timbre.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Exonéré jusqu'à"><MoneyInput value={s.timbre.exonere_jusqua} onChange={(n) => setS({ ...s, timbre: { ...s.timbre, exonere_jusqua: n } })} /></Field>
                <Field label="Minimum perçu"><MoneyInput value={s.timbre.minimum} onChange={(n) => setS({ ...s, timbre: { ...s.timbre, minimum: n } })} /></Field>
              </div>
              <table className="mt-3 w-full text-[13px]">
                <thead><tr className="text-muted"><th className="py-1 text-start font-medium">Montant jusqu'à</th><th className="py-1 text-start font-medium">DA par tranche de 100 DA</th></tr></thead>
                <tbody>
                  {s.timbre.tranches.map((t, i) => (
                    <tr key={i}>
                      <td className="py-1 pe-2">{t.jusqua === null ? <span className="text-muted">Au-delà</span> : <MoneyInput value={t.jusqua} onChange={(n) => setTranche(i, { jusqua: n })} aria-label="Montant maximum de la tranche" />}</td>
                      <td className="py-1"><Input type="number" step="0.5" min={0} value={t.par_100} onChange={(e) => setTranche(i, { par_100: Number(e.target.value) })} aria-label="Taux de la tranche" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>
      </div>

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

      <Panel title="Export des données">
        <p className="text-[13px] text-muted">Les données sont stockées dans la base Supabase, sauvegardée par Supabase. Cet export est une copie supplémentaire, à conserver en lieu sûr : il contient des données personnelles de clients.</p>
        <Button className="mt-3" icon={<Download className="h-4 w-4" />} onClick={exportBackup}>Télécharger un export complet (JSON)</Button>
      </Panel>

      {depot && <DepotModal initial={depot === 'new' ? undefined : depot} onClose={() => setDepot(null)} />}
    </div>
  );
}
