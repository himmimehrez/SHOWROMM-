import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { dateTime, downloadCsv, toInputDate } from '../lib/format';
import type { AuditLog } from '../lib/types';
import { DataTable, type Column } from '../components/DataTable';
import { Button, PageHeader, Select } from '../components/ui';

export function AuditPage() {
  const logs = useLiveQuery(() => db.audit.toArray(), []);
  const [user, setUser] = useState('');
  const users = useMemo(() => [...new Set((logs ?? []).map((l) => l.user))].sort(), [logs]);
  const rows = useMemo(() => (logs ?? []).filter((l) => !user || l.user === user), [logs, user]);

  const columns: Column<AuditLog>[] = [
    { key: 'date', header: 'Date', sortValue: (l) => l.date, render: (l) => dateTime(l.date) },
    { key: 'user', header: 'Utilisateur', sortValue: (l) => l.user, render: (l) => l.user },
    { key: 'action', header: 'Action', sortValue: (l) => l.action, render: (l) => <span className="font-medium">{l.action}</span> },
    { key: 'ref', header: 'Objet', render: (l) => <span>{l.objet}{l.ref ? <span className="text-muted"> · {l.ref}</span> : null}</span> },
    { key: 'details', header: 'Détails', render: (l) => <span className="text-muted">{l.details}</span>, hideOnMobile: true },
  ];

  return (
    <div>
      <PageHeader
        title="Journal d'audit"
        description="Toutes les opérations sensibles : connexions, ventes, encaissements, annulations, changements de prix et de droits."
        actions={<Button onClick={() => downloadCsv(`audit-${toInputDate(Date.now())}.csv`, [['Date', 'Utilisateur', 'Action', 'Objet', 'Référence', 'Détails'], ...rows.map((l) => [dateTime(l.date), l.user, l.action, l.objet, l.ref, l.details])])}>Exporter CSV</Button>}
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(l) => l.id}
        initialSort={{ key: 'date', dir: 'desc' }}
        pageSize={25}
        searchText={(l) => `${l.action} ${l.objet} ${l.ref} ${l.details} ${l.user}`}
        filters={
          <Select value={user} onChange={(e) => setUser(e.target.value)} className="w-auto" aria-label="Utilisateur">
            <option value="">Tous les utilisateurs</option>
            {users.map((u) => <option key={u}>{u}</option>)}
          </Select>
        }
      />
    </div>
  );
}
