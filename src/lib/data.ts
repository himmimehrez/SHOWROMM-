import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Backend, SelectOptions } from './backend/types';

/**
 * Lecture des données avec rafraîchissement automatique :
 *  - après chaque opération (invalidate) ;
 *  - quand la fenêtre redevient active ;
 *  - toutes les 30 secondes (modifications faites par les collègues sur d'autres postes).
 * Les requêtes identiques lancées en même temps sont partagées.
 */

let backend: Backend | null = null;
export function setBackend(b: Backend) { backend = b; }
export function getBackend(): Backend {
  if (!backend) throw new Error('Base de données non initialisée');
  return backend;
}

let version = 0;
const subscribers = new Set<() => void>();
export function invalidate() {
  version += 1;
  cache.clear();
  subscribers.forEach((s) => s());
}
function subscribe(cb: () => void) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => invalidate());
  setInterval(() => { if (document.visibilityState === 'visible') invalidate(); }, 30_000);
}

// ── Erreur de chargement globale (affichée en bandeau) ──
let loadError: string | null = null;
const errorSubs = new Set<() => void>();
function setLoadError(e: string | null) {
  if (e === loadError) return;
  loadError = e;
  errorSubs.forEach((s) => s());
}
export function useLoadError() {
  return useSyncExternalStore((cb) => { errorSubs.add(cb); return () => errorSubs.delete(cb); }, () => loadError);
}

const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = fn();
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

/** Données calculées par une fonction asynchrone. `key` identifie la requête (partage et cache). */
export function useData<T>(key: string | null, fn: () => Promise<T>): T | undefined {
  const v = useSyncExternalStore(subscribe, () => version);
  const [state, setState] = useState<{ key: string | null; data: T | undefined }>({ key: null, data: undefined });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (key === null) return;
    let alive = true;
    cached(key, () => fnRef.current())
      .then((data) => { if (alive) { setState({ key, data }); setLoadError(null); } })
      .catch((e: Error) => { if (alive) setLoadError(e.message); console.error(e); });
    return () => { alive = false; };
  }, [key, v]);
  // tant que la nouvelle clé n'est pas chargée, on garde les dernières données de la même clé
  return state.key === key ? state.data : undefined;
}

/** Lecture d'une table (droits appliqués par la base) */
export function useTable<T>(table: string | null, opts?: SelectOptions): T[] | undefined {
  const key = table ? `t:${table}:${JSON.stringify(opts ?? {})}` : null;
  return useData(key, () => getBackend().select<T>(table!, opts));
}

/** Lecture ponctuelle (hors React), avec le même cache */
export function fetchTable<T>(table: string, opts?: SelectOptions): Promise<T[]> {
  return cached(`t:${table}:${JSON.stringify(opts ?? {})}`, () => getBackend().select<T>(table, opts));
}
