import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Printer } from 'lucide-react';
import { useApp } from '../app-context';
import { db } from '../lib/db';
import { useClientsMap, useDataset, useDepots, useFournisseursMap } from '../lib/hooks';
import { computeKpis, coutVente, fraisParVehicule, groupBy, type Period } from '../lib/stats';
import { da, date, downloadCsv, toInputDate } from '../lib/format';
import { STATUT_VEHICULE } from '../lib/labels';
import { Button, PageHeader, Panel, Tabs, cx } from '../components/ui';
import { PeriodPicker, periodFor, type PeriodKey, PERIOD_LABELS } from '../components/PeriodPicker';

type Onglet = 'synthese' | 'ventes' | 'rentabilite' | 'depenses' | 'creances' | 'stock' | 'caisse';

interface Report { headers: string[]; rows: (string | number)[][]; align?: ('start' | 'end')[]; total?: (string | number)[] }

function ReportTable({ r }: { r: Report }) {
  if (r.rows.length === 0) return <p className="py-10 text-center text-muted">Aucune donnée sur cette période.</p>;
  const fmt = (v: string | number, i: number) => (typeof v === 'number' && r.align?.[i] === 'end' ? da(v) : v);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead><tr className="border-b border-line text-muted">{r.headers.map((h, i) => <th key={h} className={cx('px-3 py-2 font-medium', r.align?.[i] === 'end' ? 'text-end' : 'text-start')}>{h}</th>)}</tr></thead>
        <tbody>
          {r.rows.map((row, j) => (
            <tr key={j} className="border-b border-line last:border-0">
              {row.map((c, i) => <td key={i} className={cx('px-3 py-2 tabular-nums', r.align?.[i] === 'end' ? 'text-end' : 'text-start', typeof c === 'number' && c < 0 && 'text-red')}>{fmt(c, i)}</td>)}
            </tr>
          ))}
        </tbody>
        {r.total && (
          <tfoot><tr className="border-t-2 border-line font-semibold">{r.total.map((c, i) => <td key={i} className={cx('px-3 py-2 tabular-nums', r.align?.[i] === 'end' ? 'text-end' : 'text-start')}>{fmt(c, i)}</td>)}</tr></tfoot>
        )}
      </table>
    </div>
  );
}

const inP = (t: number, p: Period) => t >= p.from && t < p.to;

export function RapportsPage() {
  const { settings } = useApp();
  const ds = useDataset();
  const clients = useClientsMap();
  const fournisseurs = useFournisseursMap();
  const { depotById } = useDepots();
  const sessions = useLiveQuery(() => db.caisse_sessions.where('statut').equals('cloturee').toArray(), []) ?? [];
  const [onglet, setOnglet] = useState<Onglet>('synthese');
  const [pk, setPk] = useState<PeriodKey>('mois');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const period = useMemo(() => periodFor(pk, custom), [pk, custom]);

  const data = useMemo(() => {
    if (!ds) return null;
    const kpi = computeKpis(ds, period);
    const vehMap = new Map(ds.vehicules.map((v) => [v.id, v]));
    const frais = fraisParVehicule(ds.depenses);
    const ventes = ds.ventes.filter((v) => v.statut !== 'annulee' && inP(v.date, period));
    const paye = new Map<string, number>();
    for (const e of ds.encaissements) paye.set(e.vente_id, (paye.get(e.vente_id) ?? 0) + (e.type === 'paiement' ? e.montant : -e.montant));

    const synthese: Report = {
      headers: ['Indicateur', 'Montant'], align: ['start', 'end'],
      rows: [
        ["Chiffre d'affaires net", kpi.ca],
        ['Coût de revient des véhicules vendus', -kpi.cout],
        ['Marge brute estimée', kpi.marge],
        ['Charges (dépenses non rattachées à un véhicule)', -kpi.charges],
        ['Résultat estimé', kpi.resultat],
        ['Encaissements nets de la période', kpi.encaisse],
        ['Frais rattachés aux véhicules (pour information)', kpi.fraisVehicules],
      ],
    };

    const parMarque = groupBy(ventes, (v) => vehMap.get(v.vehicule_id)?.marque ?? v.vehicule_libelle.split(' ')[0], (v) => v.total_net);
    const parCommercial = groupBy(ventes, (v) => v.commercial, (v) => v.total_net);
    const ventesR: Report = {
      headers: ['Regroupement', 'Nombre', "Chiffre d'affaires"], align: ['start', 'start', 'end'],
      rows: [...parMarque.map((g) => [`Marque : ${g.label}`, g.count, g.total]), ...parCommercial.map((g) => [`Conseiller : ${g.label}`, g.count, g.total])],
    };

    const rentabilite: Report = {
      headers: ['Vente', 'Date', 'Véhicule', 'Prix net', 'Coût de revient', 'Marge', 'Taux'], align: ['start', 'start', 'start', 'end', 'end', 'end', 'start'],
      rows: ventes.sort((a, b) => b.date - a.date).map((v) => {
        const c = coutVente(v, vehMap, frais);
        return [v.numero, date(v.date), v.vehicule_libelle, v.total_net, c, v.total_net - c, v.total_net ? `${((v.total_net - c) / v.total_net * 100).toFixed(1)} %` : '—'];
      }),
      total: ['Total', '', `${ventes.length} véhicule(s)`, kpi.ca, kpi.cout, kpi.marge, kpi.ca ? `${(kpi.tauxMarge * 100).toFixed(1)} %` : '—'],
    };

    const deps = ds.depenses.filter((d) => !d.annulee && inP(d.date, period));
    const parCat = groupBy(deps, (d) => d.categorie, (d) => d.montant);
    const depensesR: Report = {
      headers: ['Catégorie', 'Nombre', 'Dont rattaché aux véhicules', 'Total'], align: ['start', 'start', 'end', 'end'],
      rows: parCat.map((g) => [g.label, g.count, deps.filter((d) => d.categorie === g.label && d.vehicule_id).reduce((s, d) => s + d.montant, 0), g.total]),
      total: ['Total', deps.length, kpi.fraisVehicules, kpi.charges + kpi.fraisVehicules],
    };

    const creancesRows = ds.ventes.filter((v) => v.statut !== 'annulee' && v.total_net - (paye.get(v.id) ?? 0) > 0)
      .map((v) => [clients.get(v.client_id)?.nom ?? '', v.numero, date(v.date), v.total_net, paye.get(v.id) ?? 0, v.total_net - (paye.get(v.id) ?? 0)] as (string | number)[]);
    const payeAchat = new Map<string, number>();
    for (const p of ds.paiementsFournisseurs) payeAchat.set(p.achat_id, (payeAchat.get(p.achat_id) ?? 0) + p.montant);
    const dettesRows = ds.achats.filter((a) => a.statut !== 'annule' && a.montant_total - (payeAchat.get(a.id) ?? 0) > 0)
      .map((a) => [`Fournisseur : ${fournisseurs.get(a.fournisseur_id)?.nom ?? ''}`, a.numero, date(a.date), a.montant_total, payeAchat.get(a.id) ?? 0, a.montant_total - (payeAchat.get(a.id) ?? 0)] as (string | number)[]);
    const creances: Report = {
      headers: ['Tiers', 'Pièce', 'Date', 'Montant', 'Réglé', 'Reste'], align: ['start', 'start', 'start', 'end', 'end', 'end'],
      rows: [...creancesRows, ...dettesRows],
      total: ['Clients : ' + da(kpi.creances), '', 'Fournisseurs : ' + da(kpi.dettes), '', '', ''],
    };

    const stockRows = ds.vehicules.filter((v) => v.statut !== 'livre' && v.statut !== 'vendu').sort((a, b) => a.created_at - b.created_at).map((v) => {
      const c = v.prix_achat + (frais.get(v.id) ?? 0);
      return [v.reference, `${v.marque} ${v.modele} ${v.finition}`.trim(), depotById.get(v.depot_id)?.nom ?? '', STATUT_VEHICULE[v.statut].label, `${Math.floor((Date.now() - v.created_at) / 86400000)} j`, c, v.prix_vente, v.prix_vente - c] as (string | number)[];
    });
    const stock: Report = {
      headers: ['Réf.', 'Véhicule', 'Dépôt', 'Statut', 'Ancienneté', 'Coût de revient', 'Prix affiché', 'Marge potentielle'], align: ['start', 'start', 'start', 'start', 'start', 'end', 'end', 'end'],
      rows: stockRows,
      total: ['Total', `${stockRows.length} véhicule(s)`, '', '', '', kpi.valeurStock, kpi.valeurStockVente, kpi.valeurStockVente - kpi.valeurStock],
    };

    const sess = sessions.filter((s) => inP(s.cloture, period)).sort((a, b) => b.cloture - a.cloture);
    const caisse: Report = {
      headers: ['Session', 'Clôture', 'Par', 'Théorique', 'Compté', 'Écart', 'Observations'], align: ['start', 'start', 'start', 'end', 'end', 'end', 'start'],
      rows: sess.map((s) => [s.numero, date(s.cloture), s.cloturee_par, s.theorique, s.compte, s.ecart, s.notes]),
      total: ['Total des écarts', '', '', '', '', sess.reduce((s, x) => s + x.ecart, 0), ''],
    };

    return { kpi, reports: { synthese, ventes: ventesR, rentabilite, depenses: depensesR, creances, stock, caisse } as Record<Onglet, Report> };
  }, [ds, period, clients, fournisseurs, depotById, sessions]);

  if (!data) return <div className="text-muted">Chargement…</div>;
  const report = data.reports[onglet];
  const periodLabel = pk === 'perso' && custom.from ? `du ${custom.from} au ${custom.to || "aujourd'hui"}` : PERIOD_LABELS[pk].toLowerCase();
  const instant = onglet === 'creances' || onglet === 'stock';

  return (
    <div className="space-y-4">
      <PageHeader title="Rapports" description={`${settings.nom} — ${instant ? 'situation à ce jour' : periodLabel}`} actions={
        <>
          <PeriodPicker value={pk} onChange={setPk} custom={custom} onCustom={setCustom} />
          <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadCsv(`rapport-${onglet}-${toInputDate(Date.now())}.csv`, [report.headers, ...report.rows, ...(report.total ? [report.total] : [])])}>CSV</Button>
          <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>PDF</Button>
        </>
      } />
      <Tabs value={onglet} onChange={setOnglet} items={[
        { id: 'synthese', label: 'Synthèse' },
        { id: 'ventes', label: 'Ventes' },
        { id: 'rentabilite', label: 'Rentabilité par véhicule' },
        { id: 'depenses', label: 'Dépenses' },
        { id: 'creances', label: 'Créances et dettes' },
        { id: 'stock', label: 'Stock' },
        { id: 'caisse', label: 'Écarts de caisse' },
      ]} />
      <div className="print-area">
        <h2 className="mb-3 hidden text-lg font-semibold print:block">{settings.nom} — Rapport {onglet} — {instant ? `au ${date(Date.now())}` : periodLabel}</h2>
        <Panel padded={false}><ReportTable r={report} /></Panel>
      </div>
      {onglet === 'synthese' && (
        <Panel title="Comment ces chiffres sont calculés">
          <ul className="list-disc space-y-1.5 ps-5 text-[13px] text-muted">
            <li>Chiffre d'affaires net : total après remise des ventes conclues sur la période, hors ventes annulées.</li>
            <li>Coût de revient : prix d'achat du véhicule plus les frais (transport, préparation, formalités…) qui lui sont rattachés.</li>
            <li>Charges : dépenses non rattachées à un véhicule. Les frais rattachés ne sont pas comptés une deuxième fois.</li>
            <li>Encaissements : argent effectivement reçu sur la période (un acompte reçu le mois dernier pour une vente de ce mois n'y figure pas).</li>
            <li>Résultat estimé : indicatif, hors TVA, impôts et amortissements. À rapprocher de la comptabilité.</li>
            {data.kpi.ventesSansCout > 0 && <li className="text-amber">{data.kpi.ventesSansCout} vente(s) n'ont pas de prix d'achat renseigné : la marge est surestimée.</li>}
          </ul>
        </Panel>
      )}
    </div>
  );
}
