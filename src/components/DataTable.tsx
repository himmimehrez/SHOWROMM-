import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { cx, Input } from './ui';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  align?: 'start' | 'end' | 'center';
  className?: string;
  hideOnMobile?: boolean;
}

/**
 * Tableau commun : recherche plein texte, tri par colonne, pagination, filtres libres (slot),
 * clic sur une ligne. Les données arrivent déjà chargées : adapté à quelques milliers de lignes.
 */
export function DataTable<T>({
  rows, columns, rowKey, searchText, searchPlaceholder = 'Rechercher…', filters, onRowClick, empty,
  pageSize = 15, initialSort, footer,
}: {
  rows: T[] | undefined;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  pageSize?: number;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  footer?: React.ReactNode;
}) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!rows) return [];
    let out = rows;
    const needle = q.trim().toLowerCase();
    if (needle && searchText) out = out.filter((r) => searchText(r).toLowerCase().includes(needle));
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.sortValue) {
        const sv = col.sortValue;
        out = [...out].sort((a, b) => {
          const va = sv(a);
          const vb = sv(b);
          const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr');
          return sort.dir === 'asc' ? r : -r;
        });
      }
    }
    return out;
  }, [rows, q, sort, columns, searchText]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = filtered.slice(current * pageSize, current * pageSize + pageSize);

  const toggleSort = (key: string) => {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  return (
    <div className="rounded-xl border border-line bg-surface">
      {(searchText || filters) && (
        <div className="flex flex-col gap-2 border-b border-line p-3 sm:flex-row sm:items-center">
          {searchText && (
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={searchPlaceholder} className="ps-9" aria-label="Rechercher" />
            </div>
          )}
          {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
        </div>
      )}

      {rows === undefined ? (
        <div className="px-4 py-10 text-center text-muted">Chargement…</div>
      ) : filtered.length === 0 ? (
        empty ?? <div className="px-4 py-10 text-center text-muted">{q ? 'Aucun résultat pour cette recherche.' : 'Aucune donnée.'}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-muted">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={cx(
                      'px-3 py-2.5 font-medium whitespace-nowrap',
                      c.align === 'end' ? 'text-end' : c.align === 'center' ? 'text-center' : 'text-start',
                      c.hideOnMobile && 'hidden md:table-cell',
                    )}
                  >
                    {c.sortValue ? (
                      <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-ink">
                        {c.header}
                        {sort?.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                      </button>
                    ) : c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((r) => (
                <tr
                  key={rowKey(r)}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cx('border-b border-line last:border-0', onRowClick && 'cursor-pointer hover:bg-surface-2')}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cx(
                        'px-3 py-2.5 align-middle',
                        c.align === 'end' ? 'text-end' : c.align === 'center' ? 'text-center' : 'text-start',
                        c.hideOnMobile && 'hidden md:table-cell',
                        c.className,
                      )}
                    >
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {footer}

      {filtered.length > pageSize && (
        <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[13px] text-muted">
          <span>{current * pageSize + 1}–{Math.min(filtered.length, (current + 1) * pageSize)} sur {filtered.length}</span>
          <div className="flex gap-1">
            <button disabled={current === 0} onClick={() => setPage(current - 1)} className="rounded-md p-1.5 hover:bg-surface-2 disabled:opacity-40" aria-label="Page précédente">
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            </button>
            <button disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="rounded-md p-1.5 hover:bg-surface-2 disabled:opacity-40" aria-label="Page suivante">
              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
