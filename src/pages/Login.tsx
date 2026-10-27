import React, { useState } from 'react';
import { getBackend } from '../lib/data';
import { BACKEND_KIND } from '../lib/backend';
import { DEMO_ACCOUNTS } from '../lib/backend/seed';
import { Button, Field, Input, cx } from '../components/ui';
import { errorMessage } from '../components/toast';

export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [form, setForm] = useState({ nom: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setInfo('');
    if (mode === 'signup') {
      if (form.password !== form.confirm) { setError('Les deux mots de passe ne correspondent pas.'); return; }
      if (form.password.length < 8 || !/[0-9]/.test(form.password) || !/[A-Za-z]/.test(form.password)) {
        setError('Le mot de passe doit contenir au moins 8 caractères, avec des lettres et des chiffres.');
        return;
      }
      if (!form.nom.trim()) { setError('Indiquez votre nom.'); return; }
    }
    setBusy(true);
    try {
      const b = getBackend();
      if (mode === 'signup') {
        const r = await b.signUp(form.email.trim(), form.password, form.nom.trim());
        if (r.needsConfirmation) {
          setInfo('Compte créé. Ouvrez le lien de confirmation reçu par e-mail, puis connectez-vous.');
          setMode('login');
          return;
        }
      } else {
        await b.signIn(form.email.trim(), form.password);
      }
      onLoggedIn();
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
          <p className="mt-4 text-side-muted">Parc, ventes, chèques et traites, caisse et rapports, avec un compte par personne et une trace de chaque opération.</p>
        </div>
        <div className="flex gap-3 text-xs text-side-muted">
          <span className="plate">00123 125 19</span>
          <span>Montants en DA · Heure d'Alger</span>
        </div>
      </div>

      <div className="flex items-center justify-center bg-surface p-6 sm:p-10">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div>
            <h1 className="text-[22px] font-semibold">{mode === 'login' ? 'Connexion' : 'Créer un compte'}</h1>
            <p className="mt-1 text-muted">
              {mode === 'login'
                ? 'Saisissez votre adresse e-mail et votre mot de passe.'
                : 'Le tout premier compte devient administrateur. Les suivants doivent être activés par un administrateur.'}
            </p>
          </div>

          {mode === 'signup' && <Field label="Nom et prénom"><Input value={form.nom} onChange={set('nom')} autoComplete="name" required /></Field>}
          <Field label="Adresse e-mail"><Input type="email" value={form.email} onChange={set('email')} autoComplete="username" required /></Field>
          <Field label="Mot de passe" hint={mode === 'signup' ? '8 caractères minimum, lettres et chiffres.' : undefined}>
            <Input type="password" value={form.password} onChange={set('password')} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required />
          </Field>
          {mode === 'signup' && (
            <Field label="Confirmer le mot de passe"><Input type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required /></Field>
          )}

          {error && <div role="alert" className="rounded-lg border border-red/40 bg-red-soft px-3 py-2 text-[13px] text-red">{error}</div>}
          {info && <div role="status" className="rounded-lg border border-green/40 bg-green-soft px-3 py-2 text-[13px] text-green">{info}</div>}

          <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
            {mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
          </Button>
          <p className="text-center text-[13px] text-muted">
            {mode === 'login' ? 'Pas encore de compte ? ' : 'Déjà un compte ? '}
            <button type="button" className="font-medium text-brand hover:underline" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setInfo(''); }}>
              {mode === 'login' ? 'Créer un compte' : 'Se connecter'}
            </button>
          </p>

          {BACKEND_KIND === 'demo' && mode === 'login' && (
            <div className="rounded-lg border border-amber/40 bg-amber-soft p-3 text-[13px] text-amber">
              <div className="font-medium">Version de démonstration : données fictives, enregistrées dans ce navigateur.</div>
              <div className="mt-2 grid gap-1">
                {DEMO_ACCOUNTS.map((a) => (
                  <button
                    key={a.email}
                    type="button"
                    className={cx('flex justify-between rounded-md px-2 py-1 text-start hover:bg-white/50', form.email === a.email && 'bg-white/60')}
                    onClick={() => setForm({ ...form, email: a.email, password: a.password })}
                  >
                    <span>{a.nom}</span><span className="text-xs">{a.email}</span>
                  </button>
                ))}
              </div>
              <div className="mt-1 text-xs">Mot de passe des comptes : Demo2026!</div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
