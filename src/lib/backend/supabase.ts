import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ServerError, type Backend, type SelectOptions } from './types';

const AUTH_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou mot de passe incorrect.',
  'Email not confirmed': 'Adresse e-mail non confirmée : ouvrez le lien reçu par e-mail, puis reconnectez-vous.',
  'User already registered': 'Un compte existe déjà avec cette adresse e-mail.',
};

function authError(message: string): never {
  if (/rate limit/i.test(message)) throw new ServerError('Trop de tentatives : patientez quelques minutes avant de réessayer.');
  if (/Password should be/i.test(message)) throw new ServerError('Mot de passe trop faible : 8 caractères minimum, lettres et chiffres.');
  throw new ServerError(AUTH_MESSAGES[message] ?? message);
}

function dbError(e: { message: string; code?: string }): never {
  // P0001 : message métier écrit en français par les fonctions serveur
  if (e.code === 'P0001') throw new ServerError(e.message);
  if (e.code === '42501') throw new ServerError('Action non autorisée pour votre profil.');
  if (e.code === '23505') throw new ServerError('Cet enregistrement existe déjà (doublon).');
  if (/Failed to fetch|NetworkError/i.test(e.message)) throw new ServerError('Connexion au serveur impossible : vérifiez votre accès internet.');
  throw new Error(e.message);
}

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const client: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: true, storage: window.sessionStorage, autoRefreshToken: true },
  });

  return {
    kind: 'supabase',
    async signUp(email, password, nom) {
      const { data, error } = await client.auth.signUp({ email, password, options: { data: { nom } } });
      if (error) authError(error.message);
      return { needsConfirmation: !data.session };
    },
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) authError(error.message);
    },
    async signOut() {
      await client.auth.signOut();
    },
    async currentUserId() {
      const { data } = await client.auth.getSession();
      return data.session?.user.id ?? null;
    },
    onAuthChange(cb) {
      const { data } = client.auth.onAuthStateChange(() => cb());
      return () => data.subscription.unsubscribe();
    },
    async select<T>(table: string, opts: SelectOptions = {}) {
      let q = client.from(table).select('*');
      for (const [k, v] of Object.entries(opts.eq ?? {})) q = v === null ? q.is(k, null) : q.eq(k, v);
      if (opts.order) q = q.order(opts.order.column, { ascending: opts.order.ascending ?? true });
      q = q.limit(opts.limit ?? 5000);
      const { data, error } = await q;
      if (error) dbError(error);
      return (data ?? []) as T[];
    },
    async rpc<T>(fn: string, args: Record<string, unknown>) {
      const { data, error } = await client.rpc(fn, args);
      if (error) dbError(error);
      return data as T;
    },
  };
}
