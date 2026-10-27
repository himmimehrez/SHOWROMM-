import React, { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useApp } from '../app-context';
import { useTable } from '../lib/data';
import { api } from '../lib/api';
import { useDepots } from '../lib/hooks';
import { ROLE_HELP, ROLE_LABELS } from '../lib/permissions';
import { date } from '../lib/format';
import type { Profile, ProfileDepot, Role } from '../lib/types';
import { DataTable, type Column } from '../components/DataTable';
import { AsyncButton, Badge, Button, Field, Input, Modal, PageHeader, Panel, Select } from '../components/ui';
import { useToast } from '../components/toast';

function UserModal({ profile, depotsActuels, onClose }: { profile: Profile; depotsActuels: string[]; onClose: () => void }) {
  const toast = useToast();
  const { depots } = useDepots();
  const [f, setF] = useState({ nom: profile.nom, role: profile.role, actif: profile.actif, tous_depots: profile.tous_depots, depots: depotsActuels });
  const toggleDepot = (id: string) => setF((x) => ({ ...x, depots: x.depots.includes(id) ? x.depots.filter((d) => d !== id) : [...x.depots, id] }));
  return (
    <Modal open onClose={onClose} title={profile.email} footer={
      <>
        <Button onClick={onClose}>Annuler</Button>
        <AsyncButton variant="primary" disabled={!f.tous_depots && f.depots.length === 0} onRun={async () => {
          if (await toast.run(() => api.profileUpdate(profile.id, f), 'Utilisateur mis à jour')) onClose();
        }}>Enregistrer</AsyncButton>
      </>
    }>
      <div className="space-y-4">
        <Field label="Nom affiché"><Input value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /></Field>
        <Field label="Rôle" hint={ROLE_HELP[f.role]}>
          <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            {Object.entries(ROLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <label className="flex items-start gap-2 text-[13px]">
          <input type="checkbox" checked={f.actif} onChange={(e) => setF({ ...f, actif: e.target.checked })} className="mt-0.5" />
          <span>Compte actif. Décocher bloque immédiatement l'accès ; l'historique est conservé.</span>
        </label>
        {f.role !== 'admin' && f.role !== 'gerant' && f.role !== 'audit' && (
          <div className="rounded-lg border border-line p-3">
            <label className="flex items-center gap-2 text-[13px] font-medium">
              <input type="checkbox" checked={f.tous_depots} onChange={(e) => setF({ ...f, tous_depots: e.target.checked })} /> Accès à tous les dépôts
            </label>
            {!f.tous_depots && (
              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                {depots.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={f.depots.includes(d.id)} onChange={() => toggleDepot(d.id)} /> {d.nom}
                  </label>
                ))}
                {f.depots.length === 0 && <p className="text-xs text-red sm:col-span-2">Choisissez au moins un dépôt.</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function UtilisateursPage() {
  const profiles = useTable<Profile>('profiles');
  const liens = useTable<ProfileDepot>('profile_depots') ?? [];
  const { depotById } = useDepots();
  const [edit, setEdit] = useState<Profile | null>(null);
  const enAttente = (profiles ?? []).filter((p) => !p.actif).length;

  const columns: Column<Profile>[] = [
    { key: 'nom', header: 'Utilisateur', sortValue: (u) => u.nom || u.email, render: (u) => <div><div className="font-medium">{u.nom || '—'}</div><div className="text-xs text-muted">{u.email}</div></div> },
    { key: 'role', header: 'Rôle', sortValue: (u) => u.role, render: (u) => <Badge tone={u.role === 'admin' ? 'brand' : 'neutral'}>{ROLE_LABELS[u.role]}</Badge> },
    { key: 'depots', header: 'Dépôts', hideOnMobile: true, render: (u) => u.tous_depots || ['admin', 'gerant', 'audit'].includes(u.role)
      ? <span className="text-muted">Tous</span>
      : liens.filter((l) => l.profile_id === u.id).map((l) => depotById.get(l.depot_id)?.code).join(', ') || '—' },
    { key: 'actif', header: 'Statut', sortValue: (u) => (u.actif ? 1 : 0), render: (u) => u.actif ? <Badge tone="green">Actif</Badge> : <Badge tone="amber">En attente / désactivé</Badge> },
    { key: 'cree', header: 'Créé le', sortValue: (u) => u.created_at, render: (u) => date(u.created_at), hideOnMobile: true },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Utilisateurs" description={enAttente > 0 ? `${enAttente} compte(s) en attente d'activation.` : 'Un compte par personne : chaque opération est enregistrée au nom de son auteur.'} />
      <Panel>
        <div className="flex items-start gap-3 text-[13px]">
          <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <p>Pour ajouter quelqu'un : la personne crée son compte depuis l'écran de connexion (« Créer un compte ») avec son adresse e-mail. Son compte apparaît ici en attente : ouvrez-le, choisissez son rôle et ses dépôts, puis cochez « Compte actif ».</p>
        </div>
      </Panel>
      <DataTable rows={profiles} columns={columns} rowKey={(u) => u.id} initialSort={{ key: 'actif', dir: 'asc' }} onRowClick={(u) => setEdit(u)} />
      <Panel title="Ce que chaque rôle peut faire">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <div key={r}>
              <div className="font-semibold">{ROLE_LABELS[r]}</div>
              <p className="mt-1 text-[13px] text-muted">{ROLE_HELP[r]}</p>
            </div>
          ))}
        </div>
      </Panel>
      {edit && <UserModal profile={edit} depotsActuels={liens.filter((l) => l.profile_id === edit.id).map((l) => l.depot_id)} onClose={() => setEdit(null)} />}
    </div>
  );
}
