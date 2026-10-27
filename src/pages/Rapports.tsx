import React, { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { useApp } from '../app-context';
import { useTable } from '../lib/data';
import { useClientsMap, useDataset, useDepots, useFournisseursMap } from '../lib/hooks';
import { computeKpis, fraisParVehicule, groupBy, type Period } from '../lib/stats';
import { da, date, downloadCsv, MODE_LABELS, toInputDate, toTime } from '../lib/format';
import { STATUT_PAIEMENT, STATUT_VEHICULE } from '../lib/labels';
import type { CaisseSession } from '../lib/types';
import { Button, PageHeader, Panel, Tabs, cx } from '../components/ui';
import { PeriodPicker, periodFor, type PeriodKey, PERIOD_LABELS } from '../components/PeriodPicker';

type Onglet = 'synthese' | 'ventes' | 'tva' | 'rentabilite' | 'depenses' | 'creances' | 'effets' | 'stock' | 'caisse';

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
              {row.map((c, i) => <td key={i} className={cx('px-3 py-2 tabular-nums', r.align?.[i] === 'end' ? 'whitespace-nowrap text-end' : 'text-start', typeof c === 'number' && c < 0 && 'text-red')}>{fmt(c, i)}</td>)}
            </tr>
          ))}
        </tbody>
        {r.total && <tfoot><tr className="border-t-2 border-line font-semibold">{r.total.map((c, i) => <td key={i} className={cx('px-3 py-2 tabular-nums', r.align?.[i] === 'end' ? 'whitespace-nowrap text-end' : 'text-start')}>{fmt(c, i)}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}

const inP = (t: string | null, p: Period) => { const x = toTime(t); return x >= p.from && x < p.to; };

export function RapportsPage() {
  const { settings, can } = useApp();
  const ds = useDataset(can);
  const clients = useClientsMap();
  const fournisseurs = useFournisseursMap();
  const { depotById } = useDepots();
  const sessions = useTable<CaisseSession>(can('caisse.voir') ? 'caisse_sessions' : null, { eq: { statut: 'cloturee' } }) ?? [];
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
    const enc = (id: string) => ds.soldes.get(id)?.encaisse ?? 0;

    const synthese: Report = {
      headers: ['Indicateur', 'Montant'], align: ['start', 'end'],
      rows: [
        ["Chiffre d'affaires HT", kpi.ca],
        ['TVA collectée (à reverser)', kpi.tva],
        ['Ventes TTC', kpi.ttc],
        ...(can('couts.voir') ? [
          ['Coût de revient des véhicules vendus', -kpi.cout] as (string | number)[],
          ['Marge brute estimée', kpi.marge] as (string | number)[],
          ['Charges (dépenses non rattachées à un véhicule)', -kpi.charges] as (string | number)[],
          ['Résultat estimé', kpi.resultat] as (string | number)[],
        ] : []),
        ['Encaissements réels de la période', kpi.encaisse],
        ['Droit de timbre encaissé (espèces)', kpi.timbre],
        ['Chèques en attente de confirmation', kpi.chequesAttente],
        ['Traites en portefeuille', kpi.traitesPortefeuille],
      ],
    };

    const parMarque = groupBy(ventes, (v) => vehMap.get(v.vehicule_id)?.marque ?? v.vehicule_libelle.split(' ')[0], (v) => v.montant_ht);
    const parCommercial = groupBy(ventes, (v) => v.commercial_nom, (v) => v.montant_ht);
    const ventesR: Report = {
      headers: ['Regroupement', 'Nombre', 'CA HT'], align: ['start', 'start', 'end'],
      rows: [...parMarque.map((g) => [`Marque : ${g.label}`, g.count, g.total]), ...parCommercial.map((g) => [`Conseiller : ${g.label}`, g.count, g.total])],
    };

    const tvaR: Report = {
      headers: ['Vente', 'Facture', 'Date', 'Client', 'Saisie', 'Taux', 'HT', 'TVA', 'TTC'], align: ['start', 'start', 'start', 'start', 'start', 'start', 'end', 'end', 'end'],
      rows: [...ventes].sort((a, b) => a.date.localeCompare(b.date)).map((v) => [
        v.numero, v.facture_numero ?? '—', date(v.date), clients.get(v.client_id)?.nom ?? '',
        v.mode_prix === 'direct' ? 'Prix direct' : v.mode_prix === 'montants' ? 'Montants saisis' : 'Par taux',
        v.taux_tva !== null ? `${Number(v.taux_tva)} %` : v.mode_prix === 'direct' ? '—' : `${v.montant_ht ? ((v.montant_tva / v.montant_ht) * 100).toFixed(2) : 0} % eff.`,
        v.montant_ht, v.montant_tva, v.montant_ttc,
      ]),
      total: ['Total', '', '', '', '', '', kpi.ca, kpi.tva, kpi.ttc],
    };

    const rentabilite: Report = {
      headers: ['Vente', 'Date', 'Véhicule', 'Prix HT', 'Coût de revient', 'Marge', 'Taux'], align: ['start', 'start', 'start', 'end', 'end', 'end', 'start'],
      rows: [...ventes].sort((a, b) => b.date.localeCompare(a.date)).map((v) => {
        const c = ds.venteCouts.get(v.id) ?? 0;
        return [v.numero, date(v.date), v.vehicule_libelle, v.montant_ht, c, v.montant_ht - c, v.montant_ht ? `${(((v.montant_ht - c) / v.montant_ht) * 100).toFixed(1)} %` : '—'];
      }),
      total: ['Total', '', `${ventes.length} véhicule(s)`, kpi.ca, kpi.cout, kpi.marge, kpi.ca ? `${(kpi.tauxMarge * 100).toFixed(1)} %` : '—'],
    };

    const deps = ds.depenses.filter((d) => !d.annulee && inP(d.date, period));
    const depensesR: Report = {
      headers: ['Catégorie', 'Nombre', 'Dont rattaché aux véhicules', 'Total'], align: ['start', 'start', 'end', 'end'],
      rows: groupBy(deps, (d) => d.categorie, (d) => d.montant).map((g) => [g.label, g.count, deps.filter((d) => d.categorie === g.label && d.vehicule_id).reduce((s, d) => s + d.montant, 0), g.total]),
      total: ['Total', deps.length, kpi.fraisVehicules, kpi.charges + kpi.fraisVehicules],
    };

    const payeAchat = new Map<string, number>();
    for (const p of ds.paiementsFournisseurs) payeAchat.set(p.achat_id, (payeAchat.get(p.achat_id) ?? 0) + p.montant);
    const creances: Report = {
      headers: ['Tiers', 'Pièce', 'Date', 'Montant', 'Réglé', 'Reste'], align: ['start', 'start', 'start', 'end', 'end', 'end'],
      rows: [
        ...ds.ventes.filter((v) => v.statut !== 'annulee' && v.montant_ttc - enc(v.id) > 0)
          .map((v) => [clients.get(v.client_id)?.nom ?? '', v.numero, date(v.date), v.montant_ttc, enc(v.id), v.montant_ttc - enc(v.id)] as (string | number)[]),
        ...ds.achats.filter((a) => a.statut !== 'annule' && a.montant_total - (payeAchat.get(a.id) ?? 0) > 0)
          .map((a) => [`Fournisseur : ${fournisseurs.get(a.fournisseur_id)?.nom ?? ''}`, a.numero, date(a.date), a.montant_total, payeAchat.get(a.id) ?? 0, a.montant_total - (payeAchat.get(a.id) ?? 0)] as (string | number)[]),
      ],
      total: [`Clients : ${da(kpi.creances)}`, '', `Fournisseurs : ${da(kpi.dettes)}`, '', '', ''],
    };

    const effetsRows = ds.paiements.filter((p) => p.sens === 'encaissement' && ['cheque', 'cheque_certifie', 'traite'].includes(p.mode));
    const effets: Report = {
      headers: ['Reçu le', 'Type', 'Banque / n°', 'Client', 'Échéance', 'Statut', 'Montant'], align: ['start', 'start', 'start', 'start', 'start', 'start', 'end'],
      rows: effetsRows.sort((a, b) => (a.echeance ?? a.date).localeCompare(b.echeance ?? b.date)).map((p) => [
        date(p.date), MODE_LABELS[p.mode], `${p.banque} ${p.reference}`.trim(), clients.get(p.client_id)?.nom ?? '', date(p.echeance), STATUT_PAIEMENT[p.statut].label, p.montant,
      ]),
      total: ['En cours', '', '', '', '', '', kpi.chequesAttente + kpi.traitesPortefeuille],
    };

    const enStock = ds.vehicules.filter((v) => !['livre', 'vendu'].includes(v.statut)).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const stock: Report = {
      headers: ['Réf.', 'Véhicule', 'Dépôt', 'Statut', 'Ancienneté', ...(can('couts.voir') ? ['Coût de revient'] : []), 'Prix affiché HT'],
      align: ['start', 'start', 'start', 'start', 'start', ...(can('couts.voir') ? ['end' as const] : []), 'end'],
      rows: enStock.map((v) => [v.reference, `${v.marque} ${v.modele} ${v.finition}`.trim(), depotById.get(v.depot_id)?.nom ?? '', STATUT_VEHICULE[v.statut].label,
        `${Math.floor((Date.now() - toTime(v.created_at)) / 86400000)} j`, ...(can('couts.voir') ? [(ds.couts.get(v.id) ?? 0) + (frais.get(v.id) ?? 0)] : []), v.prix_vente_ht]),
      total: ['Total', `${enStock.length} véhicule(s)`, '', '', '', ...(can('couts.voir') ? [kpi.valeurStock] : []), kpi.valeurStockVente],
    };

    const sess = sessions.filter((s) => inP(s.cloture, period)).sort((a, b) => (b.cloture ?? '').localeCompare(a.cloture ?? ''));
    const caisse: Report = {
      headers: ['Session', 'Clôture', 'Par', 'Théorique', 'Compté', 'Écart', 'Observations'], align: ['start', 'start', 'start', 'end', 'end', 'end', 'start'],
      rows: sess.map((s) => [s.numero, date(s.cloture), s.cloturee_par, s.theorique ?? 0, s.compte ?? 0, s.ecart ?? 0, s.notes]),
      total: ['Total des écarts', '', '', '', '', sess.reduce((s, x) => s + (x.ecart ?? 0), 0), ''],
    };

    return { kpi, reports: { synthese, ventes: ventesR, tva: tvaR, rentabilite, depenses: depensesR, creances, effets, stock, caisse } as Record<Onglet, Report> };
  }, [ds, period, clients, fournisseurs, depotById, sessions, can]);

  if (!data) return <div className="text-muted">Chargement…</div>;
  const report = data.reports[onglet];
  const periodLabel = pk === 'perso' && custom.from ? `du ${custom.from} au ${custom.to || "aujourd'hui"}` : PERIOD_LABELS[pk].toLowerCase();
  const instant = onglet === 'creances' || onglet === 'stock' || onglet === 'effets';
  const tabs: { id: Onglet; label: string; perm?: string }[] = [
    { id: 'synthese', label: 'Synthèse' },
    { id: 'ventes', label: 'Ventes' },
    { id: 'tva', label: 'TVA collectée' },
    { id: 'rentabilite', label: 'Rentabilité par véhicule', perm: 'couts.voir' },
    { id: 'depenses', label: 'Dépenses', perm: 'depenses.voir' },
    { id: 'creances', label: 'Créances et dettes' },
    { id: 'effets', label: 'Chèques et traites' },
    { id: 'stock', label: 'Stock' },
    { id: 'caisse', label: 'Écarts de caisse', perm: 'caisse.voir' },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Rapports" description={`${settings.nom} — ${instant ? 'situation à ce jour' : periodLabel}`} actions={
        <>
          <PeriodPicker value={pk} onChange={setPk} custom={custom} onCustom={setCustom} />
          <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadCsv(`rapport-${onglet}-${toInputDate(Date.now())}.csv`, [report.headers, ...report.rows, ...(report.total ? [report.total] : [])])}>CSV</Button>
          <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>PDF</Button>
        </>
      } />
      <Tabs value={onglet} onChange={setOnglet} items={tabs.filter((t) => !t.perm || can(t.perm))} />
      <div className="print-area">
        <h2 className="mb-3 hidden text-lg font-semibold print:block">{settings.nom} — {tabs.find((t) => t.id === onglet)?.label} — {instant ? `au ${date(Date.now())}` : periodLabel}</h2>
        <Panel padded={false}><ReportTable r={report} /></Panel>
      </div>
      {onglet === 'synthese' && (
        <Panel title="Comment ces chiffres sont calculés">
          <ul className="list-disc space-y-1.5 ps-5 text-[13px] text-muted">
            <li>Chiffre d'affaires : total HT après remise des ventes conclues sur la période, hors ventes annulées. La TVA collectée est suivie à part : elle n'est pas un revenu.</li>
            <li>Encaissements : argent réellement reçu. Un chèque compte à sa confirmation par la banque, une traite à son paiement. Le droit de timbre est indiqué à part.</li>
            <li>Coût de revient : prix d'achat du véhicule plus les frais qui lui sont rattachés, figé au moment de la vente.</li>
            <li>Charges : dépenses non rattachées à un véhicule. Les frais rattachés ne sont pas comptés une deuxième fois.</li>
            <li>Résultat estimé : indicatif, hors impôts et amortissements. À rapprocher de la comptabilité.</li>
            {data.kpi.ventesSansCout > 0 && <li className="text-amber">{data.kpi.ventesSansCout} vente(s) n'ont pas de prix d'achat renseigné : la marge est surestimée.</li>}
          </ul>
        </Panel>
      )}
    </div>
  );
}
