/**
 * Base PostgreSQL de test (PGlite) qui imite l'environnement Supabase :
 * rôles anon / authenticated, schéma auth avec auth.users et auth.uid().
 * On y charge les vraies migrations de supabase/migrations.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const MIGRATIONS = join(import.meta.dirname, '../../supabase/migrations');

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

export interface TestUser { id: string; email: string }

export async function createDb() {
  const pg = new PGlite();
  await pg.exec(SUPABASE_STUB);
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
    try {
      await pg.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
    } catch (e) {
      throw new Error(`Migration ${f} : ${(e as Error).message}`);
    }
  }

  /** Crée un compte comme le ferait Supabase Auth à l'inscription */
  async function signUp(email: string, nom = email.split('@')[0]): Promise<TestUser> {
    const id = randomUUID();
    await pg.query('reset role');
    await pg.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, { nom }]);
    return { id, email };
  }

  /** Exécute une requête en tant qu'utilisateur connecté (rôle authenticated + identifiant JWT) */
  async function as<T = Record<string, unknown>>(user: TestUser | null, sql: string, params: unknown[] = []) {
    await pg.query('reset role');
    await pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user?.id ?? '']);
    await pg.query(user ? 'set role authenticated' : 'set role anon');
    try {
      return (await pg.query<T>(sql, params)).rows;
    } finally {
      await pg.query('reset role');
    }
  }

  /** Appel d'une fonction serveur (RPC) avec paramètres nommés, comme supabase.rpc() */
  async function rpc<T = Record<string, unknown>>(user: TestUser, fn: string, args: Record<string, unknown> = {}) {
    const keys = Object.keys(args);
    const list = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
    const rows = await as<T>(user, `select * from public.${fn}(${list})`, keys.map((k) => args[k]));
    return rows;
  }

  /** Requête d'administration (contourne la sécurité, réservé à la préparation des tests) */
  async function admin<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    await pg.query('reset role');
    return (await pg.query<T>(sql, params)).rows;
  }

  return { pg, signUp, as, rpc, admin };
}

export type TestDb = Awaited<ReturnType<typeof createDb>>;
