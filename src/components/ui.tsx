import React, { useEffect, useId, useRef, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { da } from '../lib/format';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

// ───────────── Boutons ─────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:bg-brand-hover border-transparent',
  secondary: 'bg-surface text-ink border-line hover:bg-surface-2',
  ghost: 'bg-transparent text-ink border-transparent hover:bg-surface-2',
  danger: 'bg-red text-white border-transparent hover:opacity-90',
};

export function Button({
  variant = 'secondary', size = 'md', loading, icon, children, className, disabled, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: React.ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg border font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'sm' && 'h-8 px-3 text-[13px]',
        size === 'md' && 'h-9 px-3.5',
        size === 'lg' && 'h-11 px-5 text-[15px]',
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

/** Bouton qui exécute une action asynchrone et se bloque pendant son exécution (anti double clic). */
export function AsyncButton({ onRun, ...rest }: Omit<React.ComponentProps<typeof Button>, 'onClick'> & { onRun: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      {...rest}
      loading={busy || rest.loading}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try { await onRun(); } finally { setBusy(false); }
      }}
    />
  );
}

// ───────────── Champs ─────────────

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: React.ReactElement<{ id?: string }>; className?: string }) {
  const id = useId();
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink">{label}</label>
      {React.cloneElement(children, { id })}
      {error ? <span className="text-xs text-red">{error}</span> : hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}

const inputCls = 'h-9 rounded-lg border border-line bg-surface px-3 text-ink placeholder:text-muted/70 focus:outline-none focus:border-brand disabled:bg-surface-2 disabled:text-muted';

/** Largeur pleine par défaut, sauf si l'appelant fixe une largeur (w-auto, w-72…) */
function widthOf(className?: string) {
  return className && /(^|\s)(sm:|md:)?w-/.test(className) ? '' : 'w-full';
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} {...rest} className={cx(inputCls, widthOf(className), className)} />;
  },
);

/** Saisie de montant en DA avec séparateurs de milliers */
export function MoneyInput({ value, onChange, id, ...rest }: { value: number; onChange: (n: number) => void; id?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(value ? value.toLocaleString('fr-FR') : '');
  useEffect(() => {
    const parsed = Number(text.replace(/\D/g, '')) || 0;
    if (parsed !== value) setText(value ? value.toLocaleString('fr-FR') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative">
      <input
        id={id}
        inputMode="numeric"
        {...rest}
        value={text}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, '')) || 0;
          setText(n ? n.toLocaleString('fr-FR') : '');
          onChange(n);
        }}
        className={cx(inputCls, 'w-full pe-10 text-end')}
      />
      <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">DA</span>
    </div>
  );
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} className={cx(inputCls, widthOf(className), 'pe-8', className)}>{children}</select>;
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(inputCls, 'w-full h-auto min-h-[72px] py-2', className)} />;
}

// ───────────── Affichage ─────────────

type Tone = 'neutral' | 'brand' | 'green' | 'amber' | 'red' | 'blue';
const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted border-line',
  brand: 'bg-brand-soft text-brand border-transparent',
  green: 'bg-green-soft text-green border-transparent',
  amber: 'bg-amber-soft text-amber border-transparent',
  red: 'bg-red-soft text-red border-transparent',
  blue: 'bg-blue-soft text-blue border-transparent',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={cx('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap', TONES[tone])}>{children}</span>;
}

export function Money({ value, className, strong }: { value: number; className?: string; strong?: boolean }) {
  return <span dir="ltr" className={cx('tabular-nums whitespace-nowrap', strong && 'font-semibold', value < 0 && 'text-red', className)}>{da(value)}</span>;
}

export function Panel({ title, actions, children, className, padded = true }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cx('rounded-xl border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'red' | 'amber' }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
      <div className="text-[13px] text-muted">{label}</div>
      <div dir="ltr" className={cx('mt-1 text-[22px] font-semibold tracking-tight tabular-nums rtl:text-end', tone === 'red' && 'text-red', tone === 'amber' && 'text-amber')}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <div className="font-semibold">{title}</div>
      {text && <p className="mt-1 max-w-md text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={cx(
            '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium',
            value === it.id ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {it.label}
          {it.count !== undefined && <span className="ms-1.5 text-xs text-muted">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function KeyValue({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
      {items.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-muted">{k}</dt>
          <dd className="text-ink">{v ?? '—'}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

// ───────────── Fenêtres ─────────────

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
    first?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-xl sm:rounded-2xl',
          size === 'sm' && 'sm:max-w-md',
          size === 'md' && 'sm:max-w-xl',
          size === 'lg' && 'sm:max-w-3xl',
          size === 'xl' && 'sm:max-w-5xl',
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button data-close onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Confirmation d'une opération sensible, avec motif obligatoire si demandé. */
export function ConfirmDialog({
  open, onClose, title, message, confirmLabel, danger, requireReason, onConfirm,
}: {
  open: boolean; onClose: () => void; title: string; message: React.ReactNode; confirmLabel: string;
  danger?: boolean; requireReason?: string; onConfirm: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Retour</Button>
          <AsyncButton
            variant={danger ? 'danger' : 'primary'}
            disabled={Boolean(requireReason) && !reason.trim()}
            onRun={async () => { await onConfirm(reason.trim()); }}
          >
            {confirmLabel}
          </AsyncButton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="text-ink">{message}</div>
        {requireReason && (
          <Field label={requireReason}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </Field>
        )}
      </div>
    </Modal>
  );
}
