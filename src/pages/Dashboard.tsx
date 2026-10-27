import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Car, CircleDot } from 'lucide-react';
import { useApp } from '../app-context';
import { useAlerts, useClientsMap, useDataset, useOpenCash } from '../lib/hooks';
import { computeKpis, seriesParJour, groupBy } from '../lib/stats';
import { da, date, num } from '../lib/format';
import { STATUT_VENTE } from '../lib/labels';
import { Badge, Button, EmptyState, PageHeader, Panel, StatCard, cx } from '../components/ui';
import { pageAllowed } from '../components/Layout';
import { PeriodPicker, periodFor, type PeriodKey, PERIOD_LABELS } from '../components/PeriodPicker';

function compact(n: number) {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`;
  if (Math.abs(n) >= 1e3) return `${Math.round(n / 1e3)} k`;
  return String(n);
}

export function DashboardPage() {
  const { can, go, user } = useApp();
  const ds = useDataset(can);
  const cash = useOpenCash(can('caisse.voir'));
  const alerts = useAlerts(can).filter((a) => pageAllowed(a.page, can));
  const clients = useClientsMap();
  const [pk, setPk] = useState<PeriodKey>('mois');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const period = useMemo(() => periodFor(pk, custom), [pk, custom]);
  const kpi = useMemo(() => (ds ? computeKpis(ds, period) : null), [ds, period]);
  const chartPeriod = useMemo(() => (pk === 'jour' || pk === '7j' || pk === 'annee' ? periodFor('30j') : period), [pk, period]);
  const series = useMemo(() => (ds ? seriesParJour(ds, chartPeriod) : []), [ds, chartPeriod]);
  const marques = useMemo(() => (ds ? groupBy(ds.vehicules.filter((v) => v.statut === 'disponible'), (v) => v.marque, () => 1) : []), [ds]);
  const recentes = useMemo(() => (ds ? [...ds.ventes].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6) : []), [ds]);
  const showCost = can('couts.voir');

  if (!ds || !kpi) return <div className="text-muted">Chargement…</div>;
  const vide = ds.vehicules.length === 0 && ds.ventes.length === 0;
  const prenom = (user.nom || user.email).split(/[\s@(]/)[0];

  return (
    <div className="space-y-6">
      <PageHeader title={`Bonjour ${prenom}`} description={`Activité : ${PERIOD_LABELS[pk].toLowerCase()}`} actions={<PeriodPicker value={pk} onChange={setPk} custom={custom} onCustom={setCustom} />} />

      {vide && (
        <Panel>
          <EmptyState
            icon={<Car className="h-8 w-8" />}
            title="Votre showroom est vide pour l'instant"
            text="Commencez par compléter les paramètres (identité, NIF, RC…), puis ajoutez vos véhicules ou réceptionnez une commande fournisseur. Les indicateurs se rempliront avec vos opérations réelles."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {can('parametres.gerer') && <Button onClick={() => go('parametres')}>Compléter les paramètres</Button>}
                {can('vehicules.gerer') && <Button variant="primary" onClick={() => go('vehicules')}>Ajouter des véhicules</Button>}
              </div>
            }
          />
        </Panel>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Chiffre d'affaires HT" value={da(kpi.ca)} sub={`${kpi.nbVentes} vente(s) · ${da(kpi.ttc)} TTC`} />
        <StatCard label="Encaissé" value={da(kpi.encaisse)} sub={`dont ${da(kpi.encEspeces)} en espèces`} />
        {showCost
          ? <StatCard label="Marge brute estimée" value={da(kpi.marge)} sub={kpi.ca > 0 ? `${(kpi.tauxMarge * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % du CA HT` : '—'} tone={kpi.marge < 0 ? 'red' : undefined} />
          : <StatCard label="Ventes à livrer" value={num(kpi.aLivrer)} sub="soldées, en attente de bon de sortie" />}
        {showCost
          ? <StatCard label="Résultat estimé" value={da(kpi.resultat)} sub={`après ${da(kpi.charges)} de charges`} tone={kpi.resultat < 0 ? 'red' : undefined} />
          : <StatCard label="Créances clients" value={da(kpi.creances)} tone={kpi.creances > 0 ? 'amber' : undefined} />}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Véhicules disponibles" value={num(kpi.nbDisponibles)} sub={`${kpi.nbStock} en parc · ${kpi.aLivrer} soldé(s) à livrer`} />
        <StatCard label="Chèques et traites en cours" value={da(kpi.chequesAttente + kpi.traitesPortefeuille)} sub={`${da(kpi.chequesAttente)} en chèques · ${da(kpi.traitesPortefeuille)} en traites`} />
        {showCost && <StatCard label="Créances clients (TTC)" value={da(kpi.creances)} tone={kpi.creances > 0 ? 'amber' : undefined} sub="Reste à encaisser sur les ventes" />}
        {showCost
          ? <StatCard label="Valeur du stock (coût)" value={da(kpi.valeurStock)} sub={`${da(kpi.valeurStockVente)} au prix affiché HT`} />
          : can('caisse.voir') && <StatCard label="Caisse" value={cash?.session ? da(cash.solde) : 'Fermée'} sub={cash?.session ? `Session ${cash.session.numero}` : 'Ouvrez la caisse pour encaisser en espèces'} />}
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Panel title="Ventes par jour" actions={<span className="text-xs text-muted">{chartPeriod === period ? PERIOD_LABELS[pk] : '30 derniers jours'}</span>}>
          {series.every((d) => d.ca === 0 && d.encaisse === 0) ? (
            <p className="py-16 text-center text-muted">Aucune vente sur cette période.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--line)" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--line)' }} interval="preserveStartEnd" minTickGap={16} />
                  <YAxis tickFormatter={compact} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={58} />
                  <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v, name) => [da(Number(v ?? 0)), name === 'ca' ? 'CA HT' : 'Encaissé']} />
                  <Bar dataKey="ca" fill="var(--brand)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="encaisse" fill="var(--line)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-2 flex gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand" /> CA HT</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-line" /> Encaissé</span>
          </div>
        </Panel>

        <Panel title="À traiter">
          {alerts.length === 0 ? <p className="text-muted">Rien en attente.</p> : (
            <ul className="space-y-1">
              {alerts.map((a) => (
                <li key={a.id}>
                  <button onClick={() => go(a.page, a.params)} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-start hover:bg-surface-2">
                    <CircleDot className={cx('mt-0.5 h-4 w-4 shrink-0', a.tone === 'red' ? 'text-red' : a.tone === 'amber' ? 'text-amber' : 'text-blue')} />
                    <span className="text-[13px]">{a.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Panel title="Dernières ventes" actions={<Button size="sm" variant="ghost" onClick={() => go('ventes')}>Tout voir</Button>} padded={false}>
          {recentes.length === 0 ? <p className="p-4 text-muted">Aucune vente.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]"><tbody>
                {recentes.map((v) => (
                  <tr key={v.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2" onClick={() => go('ventes', { open: v.id })}>
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium">{v.numero}</td>
                    <td className="px-2 py-2.5 text-muted">{date(v.date)}</td>
                    <td className="px-2 py-2.5">{clients.get(v.client_id)?.nom}</td>
                    <td className="hidden px-2 py-2.5 md:table-cell">{v.vehicule_libelle}</td>
                    <td className="px-2 py-2.5"><Badge tone={STATUT_VENTE[v.statut].tone}>{STATUT_VENTE[v.statut].label}</Badge></td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-end tabular-nums">{da(v.montant_ttc)}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )}
        </Panel>

        <Panel title="Disponibles par marque">
          {marques.length === 0 ? <p className="text-muted">Aucun véhicule disponible.</p> : (
            <ul className="space-y-2.5">
              {marques.slice(0, 8).map((m) => (
                <li key={m.label} className="text-[13px]">
                  <div className="flex justify-between"><span>{m.label}</span><span className="tabular-nums text-muted">{m.count}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-surface-2"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${(m.count / marques[0].count) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
