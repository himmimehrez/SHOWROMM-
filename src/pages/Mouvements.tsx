import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeftRight } from 'lucide-react';
import { useApp } from '../app-context';
import { db } from '../lib/db';
import { useDepots, useVehiculesMap } from '../lib/hooks';
import { dateTime, downloadCsv, parseInputDate, toInputDate } from '../lib/format';
import { TYPE_MOUVEMENT } from '../lib/labels';
import type { Mouvement } from '../lib/types';
import { DataTable, type Column } from '../components/DataTable';
import { Button, EmptyState, Input, PageHeader, Select } from '../components/ui';

export function MouvementsPage() {
  const { go } = useApp();
  const { depotById } = useDepots();
  const vehicules = useVehiculesMap();
  const mouvements = useLiveQuery(() => db.mouvements.toArray(), []);
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const rows = useMemo(() => (mouvements ?? []).filter((m) => {
    if (type && m.type !== type) return false;
    if (from && m.date < parseInputDate(from)) return false;
    if (to && m.date >= parseInputDate(to) + 86400000) return false;
    return true;
  }), [mouvements, type, from, to]);

  const depotName = (id: string) => (id ? depotById.get(id)?.nom ?? '—' : '—');
  const vLabel = (m: Mouvement) => {
    const v = vehicules.get(m.vehicule_id);
    return v ? `${v.reference} — ${v.marque} ${v.modele}` : '—';
  };

  const columns: Column<Mouvement>[] = [
    { key: 'date', header: 'Date', sortValue: (m) => m.date, render: (m) => dateTime(m.date) },
    { key: 'type', header: 'Mouvement', sortValue: (m) => m.type, render: (m) => TYPE_MOUVEMENT[m.type] },
    { key: 'veh', header: 'Véhicule', sortValue: vLabel, render: vLabel },
    { key: 'de', header: 'De', render: (m) => depotName(m.depot_from), hideOnMobile: true },
    { key: 'vers', header: 'Vers', render: (m) => (m.type === 'livraison' ? 'Client' : depotName(m.depot_to)), hideOnMobile: true },
    { key: 'ref', header: 'Référence', render: (m) => m.ref, hideOnMobile: true },
    { key: 'motif', header: 'Motif', render: (m) => <span className="text-muted">{m.motif}</span>, hideOnMobile: true },
    { key: 'user', header: 'Par', render: (m) => m.user },
  ];

  return (
    <div>
      <PageHeader
        title="Mouvements de parc"
        description="Historique de chaque entrée, transfert, vente, blocage et sortie. Les mouvements ne se modifient pas. Pour transférer un véhicule, ouvrez sa fiche."
        actions={<Button onClick={() => downloadCsv(`mouvements-${toInputDate(Date.now())}.csv`, [
          ['Date', 'Mouvement', 'Véhicule', 'VIN', 'De', 'Vers', 'Référence', 'Motif', 'Par'],
          ...rows.map((m) => [dateTime(m.date), TYPE_MOUVEMENT[m.type], vLabel(m), vehicules.get(m.vehicule_id)?.vin ?? '', depotName(m.depot_from), m.type === 'livraison' ? 'Client' : depotName(m.depot_to), m.ref, m.motif, m.user]),
        ])}>Exporter CSV</Button>}
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(m) => m.id}
        initialSort={{ key: 'date', dir: 'desc' }}
        searchText={(m) => `${vLabel(m)} ${vehicules.get(m.vehicule_id)?.vin ?? ''} ${m.ref} ${m.motif} ${m.user}`}
        onRowClick={(m) => go('vehicules', { open: m.vehicule_id })}
        filters={
          <>
            <Select value={type} onChange={(e) => setType(e.target.value)} className="w-auto" aria-label="Type">
              <option value="">Tous les mouvements</option>
              {Object.entries(TYPE_MOUVEMENT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" aria-label="Du" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" aria-label="Au" />
          </>
        }
        empty={<EmptyState icon={<ArrowLeftRight className="h-8 w-8" />} title="Aucun mouvement" text="Les mouvements apparaissent dès qu'un véhicule entre en stock." />}
      />
    </div>
  );
}
