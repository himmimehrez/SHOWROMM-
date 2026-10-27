import type { Backend } from './types';

export const BACKEND_KIND: 'supabase' | 'demo' = import.meta.env.VITE_BACKEND === 'demo' ? 'demo' : 'supabase';

export class ConfigError extends Error {}

/** Crée l'accès aux données selon la configuration (VITE_BACKEND, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) */
export async function initBackend(): Promise<Backend> {
  if (BACKEND_KIND === 'demo') {
    const [{ createDemoBackend }, { seedDemo }] = await Promise.all([import('./demo'), import('./seed')]);
    const files = import.meta.glob('../../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const migrations = Object.keys(files).sort().map((k) => files[k]);
    return createDemoBackend({ dataDir: 'idb://showroom-manager-demo', migrations, seed: seedDemo });
  }
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) {
    throw new ConfigError('Configuration manquante : renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans le fichier .env.local.');
  }
  const { createSupabaseBackend } = await import('./supabase');
  return createSupabaseBackend(url, key);
}
