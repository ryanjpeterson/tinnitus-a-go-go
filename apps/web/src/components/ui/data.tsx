/**
 * Data: many records with several facts each, and content to fold away.
 *
 * - `DataTable` — a sortable table on desktop that becomes a list of rows
 *   on phones (never a table that scrolls sideways).
 * - `Accordion` — sections that open one at a time (or several): FAQs,
 *   advanced settings, a long detail page's extras.
 *
 * jimbo-ui reference: copy into an app as is.
 */

import { useId, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Chevron } from "@/components/ui/kit";
import { cn } from "@/lib/cn";

export type SortDir = "asc" | "desc";
export type TableSort = { key: string; dir: SortDir };

export type Column<T> = {
  key: string;
  label: string;
  /** What the cell shows. */
  cell: (row: T) => ReactNode;
  /** The value to sort by; without it the column doesn't sort. */
  sortValue?: (row: T) => string | number;
  /** Numbers and amounts: right-aligned, tabular figures. */
  numeric?: boolean;
  /** The row's name: bold, and the title of each row on phones. One per table. */
  primary?: boolean;
  /** Leave it out of the phone rows (keep three or four facts there at most). */
  hideOnPhone?: boolean;
};

/**
 * Many records with several facts each (runs, members, orders), sortable by
 * any column that has a `sortValue` — tap a heading; again to reverse. On
 * phones each record is a row: the `primary` column as its title and the
 * others as short "label value" pairs under it. `rowTo` makes every row go
 * somewhere. Keep `sort` in the URL (useUrlState) so it survives a refresh;
 * without `sort`/`onSort` it sorts on its own.
 */
export function DataTable<T>({ columns, rows, rowKey, rowTo, sort: given, onSort, caption, empty = "Nothing here yet." }: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowTo?: (row: T) => string;
  sort?: TableSort | null;
  onSort?: (sort: TableSort) => void;
  /** What the table holds, for screen readers. */
  caption: string;
  empty?: ReactNode;
}) {
  const [own, setOwn] = useState<TableSort | null>(null);
  const sort = given !== undefined ? given : own;
  const setSort = onSort ?? setOwn;
  const navigate = useNavigate();
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key);
    if (!sort || !col?.sortValue) return rows;
    const by = col.sortValue;
    const out = [...rows].sort((a, b) => {
      const x = by(a), y = by(b);
      return typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
    });
    return sort.dir === "desc" ? out.reverse() : out;
  }, [rows, columns, sort]);
  const primary = columns.find((c) => c.primary) ?? columns[0]!;
  const rest = columns.filter((c) => c !== primary && !c.hideOnPhone);
  const toggle = (c: Column<T>) => setSort({ key: c.key, dir: sort?.key === c.key && sort.dir === (c.numeric ? "desc" : "asc") ? (c.numeric ? "asc" : "desc") : (c.numeric ? "desc" : "asc") });

  if (rows.length === 0) return <div className="card p-6 text-center text-sm text-text-muted">{empty}</div>;

  return (
    <>
      {/* Phones: a row per record. */}
      <div className="card divide-etched overflow-hidden sm:hidden">
        {sorted.map((r) => {
          const body = (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-15 font-semibold text-text-base group-hover:text-accent">{primary.cell(r)}</p>
                {rest.length > 0 && (
                  <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
                    {rest.map((c) => (
                      <span key={c.key} className="min-w-0"><span className="text-text-subtle">{c.label}</span> <span className={cn("text-text-muted", c.numeric && "tabular-nums")}>{c.cell(r)}</span></span>
                    ))}
                  </p>
                )}
              </div>
              {rowTo && <Chevron className="text-text-subtle group-hover:text-accent" />}
            </>
          );
          const cls = "group flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/70";
          return rowTo ? <Link key={rowKey(r)} to={rowTo(r)} className={cls}>{body}</Link> : <div key={rowKey(r)} className={cls}>{body}</div>;
        })}
      </div>

      {/* Desktop: a table. */}
      <div className="card hidden overflow-hidden sm:block">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border">
              {columns.map((c) => {
                const on = sort?.key === c.key;
                return (
                  <th key={c.key} scope="col" aria-sort={on ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn("h-11 px-4 text-xs font-semibold uppercase tracking-wider text-text-subtle", c.numeric && "text-right")}>
                    {c.sortValue ? (
                      <button type="button" onClick={() => toggle(c)}
                        className={cn("-mx-2 inline-flex h-9 items-center gap-1 rounded-lg px-2 uppercase tracking-wider transition-colors hover:bg-surface-2 hover:text-text-base", on && "text-text-base", c.numeric && "flex-row-reverse")}>
                        {c.label}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                          className={cn("transition-transform", on ? "text-accent" : "opacity-40", on && sort!.dir === "desc" && "rotate-180")}>
                          <path d="M12 19V5M6 11l6-6 6 6" />
                        </svg>
                      </button>
                    ) : c.label}
                  </th>
                );
              })}
              {rowTo && <th aria-hidden="true" className="w-10" />}
            </tr>
          </thead>
          <tbody className="divide-etched">
            {sorted.map((r) => (
              <tr key={rowKey(r)} onClick={rowTo ? (e) => { if (!(e.target as HTMLElement).closest("a,button")) navigate(rowTo(r)); } : undefined}
                className={cn("group transition-colors", rowTo && "cursor-pointer hover:bg-surface-2/70")}>
                {columns.map((c) => (
                  <td key={c.key} className={cn("h-14 px-4", c.numeric && "text-right tabular-nums", c === primary ? "text-15 font-semibold text-text-base" : "text-text-muted")}>
                    {c === primary && rowTo ? <Link to={rowTo(r)} className="group-hover:text-accent">{c.cell(r)}</Link> : c.cell(r)}
                  </td>
                ))}
                {rowTo && <td className="pr-3"><Chevron className="text-text-subtle group-hover:text-accent" /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export type AccordionItem = { id: string; title: ReactNode; sub?: ReactNode; content: ReactNode };

/**
 * Sections that fold: each a row with a title (and a line under it) that
 * opens its content below. One open at a time unless `multiple`. Native
 * <details>, so it works with the keyboard, find-in-page and no script.
 * In one card, divided like a List. Not for the main content of a page —
 * only what most people won't need.
 */
export function Accordion({ items, multiple = false, defaultOpen, className }: {
  items: AccordionItem[];
  multiple?: boolean;
  /** The id open at first. */
  defaultOpen?: string;
  className?: string;
}) {
  const group = useId();
  return (
    <div className={cn("card divide-etched overflow-hidden", className)}>
      {items.map((it) => (
        <details key={it.id} name={multiple ? undefined : group} open={it.id === defaultOpen} className="group/acc">
          <summary className="flex min-h-[60px] cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">
              <span className="block text-15 font-semibold">{it.title}</span>
              {it.sub && <span className="block text-sm text-text-muted">{it.sub}</span>}
            </span>
            <Chevron dir="down" className="text-text-subtle transition-transform group-open/acc:rotate-180" />
          </summary>
          <div className="px-4 pb-4 text-15 text-text-muted">{it.content}</div>
        </details>
      ))}
    </div>
  );
}
