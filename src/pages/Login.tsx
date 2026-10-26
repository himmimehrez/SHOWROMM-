import React, { useState } from 'react';
import { login, setupFirstAdmin } from '../lib/auth';
import type { SessionUser } from '../lib/types';
import { Button, Field, Input } from '../components/ui';
import { errorMessage } from '../components/toast';

export function LoginPage({ firstRun, onLoggedIn }: { firstRun: boolean; onLoggedIn: (u: SessionUser) => void }) {
  const [form, setForm] = useState({ shop: '', nom: '', login: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (firstRun && form.password !== form.confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    try {
      const u = firstRun
        ? await setupFirstAdmin({ shop: form.shop, nom: form.nom, login: form.login, password: form.password })
        : await login(form.login, form.password);
      onLoggedIn(u);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-full lg:grid-cols-[1fr_minmax(420px,520px)]">
      <div className="hidden flex-col justify-between bg-side p-10 text-side-ink lg:flex">
        <div className="text-[15px] font-semibold text-white">Showroom Manager DZ</div>
        <div className="max-w-md">
          <p className="text-[30px] font-semibold leading-tight text-white">Du bon d'achat au bon de sortie, chaque véhicule suivi au même endroit.</p>
          <p className="mt-4 text-side-muted">Parc, ventes, encaissements, caisse et rapports, avec un compte par personne et une trace de chaque opération.</p>
        </div>
        <div className="flex gap-3 text-xs text-side-muted">
          <span className="plate">00123 125 19</span>
          <span>Montants en DA · Heure d'Alger</span>
        </div>
      </div>

      <div className="flex items-center justify-center bg-surface p-6 sm:p-10">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div>
            <h1 className="text-[22px] font-semibold">{firstRun ? 'Première configuration' : 'Connexion'}</h1>
            <p className="mt-1 text-muted">
              {firstRun ? "Créez le compte administrateur. Vous ajouterez ensuite les comptes de l'équipe." : 'Saisissez votre identifiant et votre mot de passe.'}
            </p>
          </div>

          {firstRun && (
            <>
              <Field label="Nom du showroom"><Input value={form.shop} onChange={set('shop')} placeholder="Ex. : Auto Prestige Sétif" required /></Field>
              <Field label="Votre nom"><Input value={form.nom} onChange={set('nom')} autoComplete="name" required /></Field>
            </>
          )}
          <Field label="Identifiant" hint={firstRun ? 'En minuscules, sans espace. Ex. : karim.h' : undefined}>
            <Input value={form.login} onChange={set('login')} autoComplete="username" autoCapitalize="none" required />
          </Field>
          <Field label="Mot de passe" hint={firstRun ? '8 caractères minimum, lettres et chiffres.' : undefined}>
            <Input type="password" value={form.password} onChange={set('password')} autoComplete={firstRun ? 'new-password' : 'current-password'} required />
          </Field>
          {firstRun && (
            <Field label="Confirmer le mot de passe">
              <Input type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required />
            </Field>
          )}

          {error && <div role="alert" className="rounded-lg border border-red/40 bg-red-soft px-3 py-2 text-[13px] text-red">{error}</div>}

          <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
            {firstRun ? 'Créer le compte et commencer' : 'Se connecter'}
          </Button>
          {!firstRun && <p className="text-xs text-muted">Mot de passe oublié : un administrateur peut le réinitialiser depuis la page Utilisateurs.</p>}
        </form>
      </div>
    </div>
  );
}
