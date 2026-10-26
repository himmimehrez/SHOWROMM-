import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus } from 'lucide-react';
import { useApp } from '../app-context';
import { db } from '../lib/db';
import { createUser, updateUser } from '../lib/auth';
import { ROLE_LABELS, ROLE_PERMISSIONS } from '../lib/permissions';
import { date } from '../lib/format';
import type { Role, User } from '../lib/types';
import { DataTable, type Column } from '../components/DataTable';
import { AsyncButton, Badge, Button, Field, Input, Modal, PageHeader, Panel, Select } from '../components/ui';
import { useToast } from '../components/toast';

const ROLE_HELP: Record<Role, string> = {
  admin: 'Tout, y compris les comptes et les paramètres.',
  gerant: 'Tout sauf la gestion des comptes : prix, remises, annulations, achats, rapports.',
  commercial: 'Clients, création de ventes et livraisons. Ne voit ni les coûts ni les marges, n’encaisse pas.',
  caissier: 'Caisse, encaissements, dépenses et clients. Ne voit ni les coûts ni les marges.',
};

function UserModal({ initial, onClose }: { initial?: User; onClose: () => void }) {
  const { user } = useApp();
  const toast = useToast();
  const [f, setF] = useState({ nom: initial?.nom ?? '', login: initial?.login ?? '', role: initial?.role ?? ('commercial' as Role), password: '', actif: initial?.actif ?? true });
  return (
    <Modal open onClose={onClose} title={initial ? `Modifier ${initial.nom}` : 'Nouvel utilisateur'} footer={
      <>
        <Button onClick={onClose}>Annuler</Button>
        <AsyncButton variant="primary" onRun={async () => {
          const ok = initial
            ? await toast.run(() => updateUser(user, initial.id, { nom: f.nom, role: f.role, actif: f.actif, password: f.password || undefined }), 'Utilisateur mis à jour')
            : await toast.run(() => createUser(user, { nom: f.nom, login: f.login, password: f.password, role: f.role }), 'Utilisateur créé');
          if (ok) onClose();
        }}>Enregistrer</AsyncButton>
      </>
    }>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom complet"><Input value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /></Field>
        <Field label="Identifiant"><Input value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} disabled={Boolean(initial)} autoCapitalize="none" /></Field>
        <Field label="Rôle" hint={ROLE_HELP[f.role]} className="sm:col-span-2">
          <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            {Object.entries(ROLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label={initial ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe initial'} hint="8 caractères minimum, lettres et chiffres" className="sm:col-span-2">
          <Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
        </Field>
        {initial && <label className="flex items-center gap-2 text-[13px] sm:col-span-2"><input type="checkbox" checked={f.actif} onChange={(e) => setF({ ...f, actif: e.target.checked })} /> Compte actif (décocher bloque immédiatement la connexion, l’historique est conservé)</label>}
      </div>
    </Modal>
  );
}

export function UtilisateursPage() {
  const users = useLiveQuery(() => db.users.toArray(), []);
  const [edit, setEdit] = useState<User | 'new' | null>(null);
  const columns: Column<User>[] = [
    { key: 'nom', header: 'Nom', sortValue: (u) => u.nom, render: (u) => <div><div className="font-medium">{u.nom}</div><div className="text-xs text-muted">{u.login}</div></div> },
    { key: 'role', header: 'Rôle', sortValue: (u) => u.role, render: (u) => <Badge tone={u.role === 'admin' ? 'brand' : 'neutral'}>{ROLE_LABELS[u.role]}</Badge> },
    { key: 'actif', header: 'Statut', render: (u) => u.actif ? <Badge tone="green">Actif</Badge> : <Badge tone="red">Désactivé</Badge> },
    { key: 'cree', header: 'Créé le', sortValue: (u) => u.created_at, render: (u) => date(u.created_at), hideOnMobile: true },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="Utilisateurs" description="Un compte par personne : chaque opération est enregistrée au nom de son auteur." actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit('new')}>Nouvel utilisateur</Button>} />
      <DataTable rows={users} columns={columns} rowKey={(u) => u.id} initialSort={{ key: 'nom', dir: 'asc' }} onRowClick={(u) => setEdit(u)} />
      <Panel title="Ce que chaque rôle peut faire">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <div key={r}>
              <div className="font-semibold">{ROLE_LABELS[r]}</div>
              <p className="mt-1 text-[13px] text-muted">{ROLE_HELP[r]}</p>
              <p className="mt-1 text-xs text-muted">{ROLE_PERMISSIONS[r].length} permission(s)</p>
            </div>
          ))}
        </div>
      </Panel>
      {edit && <UserModal initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
