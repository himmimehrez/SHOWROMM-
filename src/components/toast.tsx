import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { cx } from './ui';

interface Toast { id: number; kind: 'success' | 'error'; text: string }

interface ToastApi {
  success: (text: string) => void;
  error: (text: string) => void;
  /** Exécute une opération : notifie le succès ou l'erreur, renvoie true si tout s'est bien passé. */
  run: (fn: () => Promise<unknown>, successText?: string) => Promise<boolean>;
}

const Ctx = createContext<ToastApi | null>(null);

export function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === 'ValidationError' || e.name === 'PermissionError') return e.message;
    if (e.name === 'ConstraintError') return 'Cet enregistrement existe déjà (doublon).';
    console.error(e);
    return `Opération impossible : ${e.message}`;
  }
  return 'Une erreur inattendue est survenue.';
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);

  const api: ToastApi = {
    success: (t) => push('success', t),
    error: (t) => push('error', t),
    run: async (fn, successText) => {
      try {
        await fn();
        if (successText) push('success', successText);
        return true;
      } catch (e) {
        push('error', errorMessage(e));
        return false;
      }
    },
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 end-4 z-[60] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'flex items-start gap-2.5 rounded-xl border bg-surface px-4 py-3 shadow-lg',
              t.kind === 'success' ? 'border-green/40' : 'border-red/50',
            )}
          >
            {t.kind === 'success'
              ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green" />
              : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red" />}
            <span className="flex-1 text-[13px]">{t.text}</span>
            <button onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))} className="text-muted hover:text-ink" aria-label="Fermer">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast hors ToastProvider');
  return ctx;
}
