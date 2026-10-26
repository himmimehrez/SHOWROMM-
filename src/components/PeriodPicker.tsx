import React from 'react';
import { daysAgo, startOfDay, startOfMonth, parseInputDate, toInputDate, dayKey } from '../lib/format';
import type { Period } from '../lib/stats';
import { Input, Select } from './ui';

export type PeriodKey = 'jour' | '7j' | '30j' | 'mois' | 'annee' | 'perso';

export function periodFor(key: PeriodKey, custom?: { from: string; to: string }): Period {
  const tomorrow = startOfDay(Date.now()) + 86400000;
  switch (key) {
    case 'jour': return { from: startOfDay(Date.now()), to: tomorrow };
    case '7j': return { from: daysAgo(6), to: tomorrow };
    case '30j': return { from: daysAgo(29), to: tomorrow };
    case 'mois': return { from: startOfMonth(), to: tomorrow };
    case 'annee': return { from: Date.parse(`${dayKey(Date.now()).slice(0, 4)}-01-01T00:00:00+01:00`), to: tomorrow };
    case 'perso': return {
      from: custom?.from ? parseInputDate(custom.from) : daysAgo(29),
      to: custom?.to ? parseInputDate(custom.to) + 86400000 : tomorrow,
    };
  }
}

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  jour: "Aujourd'hui", '7j': '7 derniers jours', '30j': '30 derniers jours', mois: 'Ce mois-ci', annee: 'Cette année', perso: 'Période personnalisée',
};

export function PeriodPicker({ value, onChange, custom, onCustom }: { value: PeriodKey; onChange: (k: PeriodKey) => void; custom: { from: string; to: string }; onCustom: (c: { from: string; to: string }) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value} onChange={(e) => onChange(e.target.value as PeriodKey)} className="w-auto" aria-label="Période">
        {Object.entries(PERIOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </Select>
      {value === 'perso' && (
        <>
          <Input type="date" value={custom.from} max={custom.to || toInputDate(Date.now())} onChange={(e) => onCustom({ ...custom, from: e.target.value })} className="w-auto" aria-label="Du" />
          <Input type="date" value={custom.to} min={custom.from} onChange={(e) => onCustom({ ...custom, to: e.target.value })} className="w-auto" aria-label="Au" />
        </>
      )}
    </div>
  );
}
