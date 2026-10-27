export interface SelectOptions {
  eq?: Record<string, string | number | boolean | null>;
  order?: { column: string; ascending?: boolean };
  limit?: number;
}

/**
 * Accès aux données. Deux implémentations :
 *  - supabase : la vraie base en ligne ;
 *  - demo     : les mêmes migrations SQL exécutées dans le navigateur (PGlite), pour l'aperçu et les tests.
 * Les pages n'utilisent que cette interface, via src/lib/api.ts.
 */
export interface Backend {
  kind: 'supabase' | 'demo';
  signUp(email: string, password: string, nom: string): Promise<{ needsConfirmation: boolean }>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  currentUserId(): Promise<string | null>;
  onAuthChange(cb: () => void): () => void;
  select<T>(table: string, opts?: SelectOptions): Promise<T[]>;
  /** Appel d'une fonction serveur. Renvoie la valeur brute : ligne, liste de lignes, valeur simple ou null. */
  rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T>;
}

/** Erreur métier renvoyée par la base (message destiné à l'utilisateur) */
export class ServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
