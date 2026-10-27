/**
 * Base de démonstration : les VRAIES migrations Supabase exécutées dans le navigateur (PGlite).
 * Mêmes tables, mêmes fonctions serveur, mêmes règles de sécurité (RLS) que la version en ligne.
 * Réservée à l'aperçu et aux tests : les données restent dans ce navigateur et sont fictives.
 */
import { PGlite, types, type Transaction } from '@electric-sql/pglite';
import { SUPABASE_STUB_SQL } from './stub-sql';
import { ServerError, type Backend, type SelectOptions } from './types';

const SESSION_KEY = 'smdz_demo_uid';
const memory = new Map<string, string>();
const store = {
  get: (k: string) => { try { return globalThis.sessionStorage?.getItem(k) ?? memory.get(k) ?? null; } catch { return memory.get(k) ?? null; } },
  set: (k: string, v: string) => { memory.set(k, v); try { globalThis.sessionStorage?.setItem(k, v); } catch { /* mémoire seule */ } },
  del: (k: string) => { memory.delete(k); try { globalThis.sessionStorage?.removeItem(k); } catch { /* mémoire seule */ } },
};

function toIso(v: string) {
  // « 2026-10-27 08:00:00.123+00 » → ISO
  const s = v.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00');
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? v : d.toISOString();
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function dbError(e: unknown): never {
  const err = e as { message?: string; code?: string };
  if (err.code === 'P0001') throw new ServerError(err.message ?? 'Erreur');
  if (err.code === '42501') throw new ServerError('Action non autorisée pour votre profil.');
  if (err.code === '23505') throw new ServerError('Cet enregistrement existe déjà (doublon).');
  throw new Error(err.message ?? String(e));
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

export interface DemoOptions {
  dataDir?: string;                 // ex. « idb://showroom-demo » pour garder les données entre deux visites
  migrations: string[];             // contenu SQL, dans l'ordre
  seed?: (b: Backend) => Promise<void>;
}

export async function createDemoBackend(opts: DemoOptions): Promise<Backend & { pg: PGlite }> {
  const pg = new PGlite({
    ...(opts.dataDir ? { dataDir: opts.dataDir } : {}),
    parsers: {
      [types.INT8]: (v: string) => Number(v),
      [types.NUMERIC]: (v: string) => Number(v),
      [types.TIMESTAMPTZ]: toIso,
      [types.TIMESTAMP]: toIso,
      [types.DATE]: (v: string) => v,
    },
  });
  const installed = (await pg.query<{ t: string | null }>(`select to_regclass('public.settings')::text as t`)).rows[0].t;
  if (!installed) {
    await pg.exec(SUPABASE_STUB_SQL);
    for (const sql of opts.migrations) await pg.exec(sql);
  }

  const listeners = new Set<() => void>();
  const shapes = new Map<string, { set: boolean; composite: boolean; void: boolean }>();

  async function asUser<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const uid = store.get(SESSION_KEY);
    try {
      return await pg.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
        await tx.query(uid ? 'set local role authenticated' : 'set local role anon');
        return fn(tx);
      });
    } catch (e) {
      dbError(e);
    }
  }

  async function shape(fn: string) {
    let s = shapes.get(fn);
    if (!s) {
      const r = (await pg.query<{ proretset: boolean; typtype: string; typname: string }>(
        `select p.proretset, t.typtype, t.typname from pg_proc p join pg_type t on t.oid = p.prorettype
         where p.proname = $1 and p.pronamespace = 'public'::regnamespace limit 1`, [fn])).rows[0];
      if (!r) throw new Error(`Fonction inconnue : ${fn}`);
      s = { set: r.proretset, composite: r.typtype === 'c', void: r.typname === 'void' };
      shapes.set(fn, s);
    }
    return s;
  }

  const backend: Backend & { pg: PGlite } = {
    kind: 'demo',
    pg,
    async signUp(email, password, nom) {
      const e = email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new ServerError('Adresse e-mail invalide.');
      if (password.length < 8) throw new ServerError('Mot de passe trop faible : 8 caractères minimum.');
      const exists = (await pg.query('select 1 from auth.users where email = $1', [e])).rows.length > 0;
      if (exists) throw new ServerError('Un compte existe déjà avec cette adresse e-mail.');
      const id = crypto.randomUUID();
      await pg.query(`insert into auth.users (id, email, raw_user_meta_data, pw_hash) values ($1, $2, $3, $4)`,
        [id, e, { nom }, await sha256(`${e}:${password}`)]);
      store.set(SESSION_KEY, id);
      listeners.forEach((l) => l());
      return { needsConfirmation: false };
    },
    async signIn(email, password) {
      const e = email.trim().toLowerCase();
      const row = (await pg.query<{ id: string; pw_hash: string }>('select id, pw_hash from auth.users where email = $1', [e])).rows[0];
      if (!row || row.pw_hash !== (await sha256(`${e}:${password}`))) throw new ServerError('E-mail ou mot de passe incorrect.');
      store.set(SESSION_KEY, row.id);
      listeners.forEach((l) => l());
    },
    async signOut() {
      store.del(SESSION_KEY);
      listeners.forEach((l) => l());
    },
    async currentUserId() {
      return store.get(SESSION_KEY);
    },
    onAuthChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async select<T>(table: string, o: SelectOptions = {}) {
      if (!IDENT.test(table)) throw new Error('Table invalide');
      const params: unknown[] = [];
      const where = Object.entries(o.eq ?? {}).map(([k, v]) => {
        if (!IDENT.test(k)) throw new Error('Colonne invalide');
        if (v === null) return `${k} is null`;
        params.push(v);
        return `${k} = $${params.length}`;
      });
      if (o.order && !IDENT.test(o.order.column)) throw new Error('Colonne invalide');
      const sql = `select * from public.${table}${where.length ? ` where ${where.join(' and ')}` : ''}`
        + (o.order ? ` order by ${o.order.column} ${o.order.ascending === false ? 'desc' : 'asc'}` : '')
        + ` limit ${Math.max(1, Math.min(o.limit ?? 5000, 5000))}`;
      return asUser(async (tx) => (await tx.query<T>(sql, params)).rows);
    },
    async rpc<T>(fn: string, args: Record<string, unknown>) {
      if (!IDENT.test(fn)) throw new Error('Fonction invalide');
      const s = await shape(fn);
      const keys = Object.keys(args).filter((k) => args[k] !== undefined);
      keys.forEach((k) => { if (!IDENT.test(k)) throw new Error('Paramètre invalide'); });
      const list = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
      const values = keys.map((k) => args[k]);
      return asUser(async (tx) => {
        if (s.set || s.composite) {
          const rows = (await tx.query<Record<string, unknown>>(`select * from public.${fn}(${list})`, values)).rows;
          if (s.set) return rows as T;
          const r = rows[0];
          return (r && Object.values(r).some((x) => x !== null) ? r : null) as T;
        }
        const rows = (await tx.query<{ v: unknown }>(`select public.${fn}(${list}) as v`, values)).rows;
        return (s.void ? null : rows[0]?.v) as T;
      });
    },
  };

  if (!installed && opts.seed) {
    await opts.seed(backend);
    await backend.signOut();
  }
  return backend;
}
