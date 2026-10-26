const TZ = 'Africa/Algiers';

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** 1234567 → « 1 234 567 DA » */
export function da(amount: number | undefined | null): string {
  return `${nf.format(Math.round(amount ?? 0))} DA`;
}

export function num(n: number | undefined | null): string {
  return nf.format(n ?? 0);
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

/** JJ/MM/AAAA */
export function date(ts: number | undefined | null): string {
  return ts ? dateFmt.format(ts) : '—';
}

export function dateTime(ts: number | undefined | null): string {
  return ts ? dateTimeFmt.format(ts).replace(',', ' à') : '—';
}

/** Clé AAAA-MM-JJ dans le fuseau d'Alger (pour regrouper par jour) */
export function dayKey(ts: number): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts);
  return p; // en-CA renvoie déjà AAAA-MM-JJ
}

/** Début de journée (Alger) pour un timestamp */
export function startOfDay(ts: number): number {
  const key = dayKey(ts);
  // Alger = UTC+1 toute l'année (pas d'heure d'été)
  return Date.parse(`${key}T00:00:00+01:00`);
}

export function daysAgo(n: number, from = Date.now()): number {
  return startOfDay(from) - n * 86400000;
}

export function startOfMonth(ts = Date.now()): number {
  const key = dayKey(ts).slice(0, 7);
  return Date.parse(`${key}-01T00:00:00+01:00`);
}

export function currentYear(ts = Date.now()): number {
  return Number(dayKey(ts).slice(0, 4));
}

/** Convertit « 2026-10-26 » (input date) en timestamp de début de journée à Alger */
export function parseInputDate(v: string): number {
  return Date.parse(`${v}T00:00:00+01:00`);
}

export function toInputDate(ts: number): string {
  return dayKey(ts);
}

export const MODE_LABELS = {
  especes: 'Espèces',
  cheque: 'Chèque',
  virement: 'Virement',
  tpe: 'Carte (TPE)',
} as const;

/** Export CSV compatible Excel (séparateur ; et BOM UTF-8) */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
