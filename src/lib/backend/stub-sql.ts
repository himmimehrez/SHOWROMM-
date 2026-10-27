// Imitation minimale de l'environnement Supabase pour exécuter les migrations hors Supabase
// (base de démonstration dans le navigateur et tests automatisés).
export const SUPABASE_STUB_SQL = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text unique,
    raw_user_meta_data jsonb default '{}'::jsonb,
    pw_hash text
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;
