/**
 * Concert grid — AG-Grid batch editor.
 *
 * All concert + attendance fields are editable inline.
 * Artists can be expanded under each concert row.
 * Dirty rows are highlighted until saved via PATCH /concerts/batch.
 */

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AgGridReact } from "ag-grid-react";
import {
  type ColDef,
  type ColGroupDef,
  type GridReadyEvent,
  type CellValueChangedEvent,
  type GridApi,
  type RowClassParams,
  type ICellRendererParams,
  type IRowNode,
  ModuleRegistry,
  AllCommunityModule,
} from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { clsx } from "clsx";
import { api, type ConcertListItem, type ConcertArtist } from "@/lib/api";
import type { AttendanceStatus } from "@tagg/shared";

ModuleRegistry.registerModules([AllCommunityModule]);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ConcertRow {
  _type: "concert";
  id: string;
  date: string;
  headliner: string;       // display-only, derived from artists
  venueName: string;
  venueCity: string;
  concertType: "concert" | "festival_day";
  status: AttendanceStatus;
  personalNotes: string | null;
  ticketPricePaid: number | null;
  ticketPriceCurrency: string | null;
  // Artists (for expand)
  _artists: ConcertArtist[];
  _expanded: boolean;
  // Originals (dirty tracking)
  _origDate: string;
  _origVenueName: string;
  _origVenueCity: string;
  _origConcertType: "concert" | "festival_day";
  _origStatus: AttendanceStatus;
  _origNotes: string | null;
  _origTicket: number | null;
  _origCurrency: string | null;
  _dirty: boolean;
}

interface ArtistRow {
  _type: "artist";
  id: string;               // `${concertId}_a_${setOrder}`
  _concertId: string;
  _artistName: string;
  _artistRole: string;
  _artistSetOrder: number | null;
  // Dummy fields (satisfy AG-Grid column refs)
  date: string;
  headliner: string;
  venueName: string;
  venueCity: string;
  concertType: "concert" | "festival_day";
  status: AttendanceStatus;
  personalNotes: null;
  ticketPricePaid: null;
  ticketPriceCurrency: null;
  _artists: never[];
  _expanded: false;
  _dirty: false;
}

type GridRow = ConcertRow | ArtistRow;

// Context passed to all cell renderers
interface GridCtx {
  toggleExpand: (concertId: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function deriveHeadliner(c: ConcertListItem): string {
  const hl = c.artists.find((a) => a.role === "headliner") ?? c.artists.at(-1);
  return hl?.name ?? c.headlinerHint ?? c.eventSeries?.name ?? "Unknown show";
}

function toConcertRow(c: ConcertListItem): ConcertRow {
  return {
    _type: "concert",
    id: c.id,
    date: c.date,
    headliner: deriveHeadliner(c),
    venueName: c.venue?.name ?? "",
    venueCity: c.venue?.city ?? "",
    concertType: c.type,
    status: c.attendance.status,
    personalNotes: c.attendance.personalNotes,
    ticketPricePaid: c.attendance.ticketPricePaid,
    ticketPriceCurrency: c.attendance.ticketPriceCurrency,
    _artists: c.artists,
    _expanded: false,
    _origDate: c.date,
    _origVenueName: c.venue?.name ?? "",
    _origVenueCity: c.venue?.city ?? "",
    _origConcertType: c.type,
    _origStatus: c.attendance.status,
    _origNotes: c.attendance.personalNotes,
    _origTicket: c.attendance.ticketPricePaid,
    _origCurrency: c.attendance.ticketPriceCurrency,
    _dirty: false,
  };
}

function toArtistRows(concertId: string, artists: ConcertArtist[]): ArtistRow[] {
  return artists.map((a, i) => ({
    _type: "artist" as const,
    id: `${concertId}_a_${i}`,
    _concertId: concertId,
    _artistName: a.name,
    _artistRole: a.role,
    _artistSetOrder: a.setOrder,
    date: "",
    headliner: "",
    venueName: "",
    venueCity: "",
    concertType: "concert" as const,
    status: "attended" as const,
    personalNotes: null,
    ticketPricePaid: null,
    ticketPriceCurrency: null,
    _artists: [],
    _expanded: false as const,
    _dirty: false as const,
  }));
}

function isDirty(row: ConcertRow): boolean {
  return (
    row.date !== row._origDate ||
    row.venueName !== row._origVenueName ||
    row.venueCity !== row._origVenueCity ||
    row.concertType !== row._origConcertType ||
    row.status !== row._origStatus ||
    row.personalNotes !== row._origNotes ||
    row.ticketPricePaid !== row._origTicket ||
    row.ticketPriceCurrency !== row._origCurrency
  );
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "attended", "attending", "interested", "missed", "cancelled", "dismissed",
];

const ROLE_LABEL: Record<string, string> = {
  headliner: "HL",
  co_headliner: "co-HL",
  support: "",
  opener: "",
  festival_set: "",
};

// ─────────────────────────────────────────────────────────────────────────────
// Cell renderers
// ─────────────────────────────────────────────────────────────────────────────

function ExpandBtn(params: ICellRendererParams<GridRow>) {
  const data = params.data;
  const ctx = params.context as GridCtx | undefined;
  if (!data || data._type !== "concert") return null;
  const count = data._artists.length;
  if (count === 0) return <span className="text-text-subtle text-xs font-mono">—</span>;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        ctx?.toggleExpand(data.id);
      }}
      className="flex items-center gap-1.5 text-text-subtle hover:text-accent-lime transition-colors text-xs font-mono w-full h-full"
    >
      <span className="text-[10px]">{data._expanded ? "▾" : "▸"}</span>
      <span>{count}</span>
    </button>
  );
}

function ShowCell(params: ICellRendererParams<GridRow>) {
  const data = params.data;
  if (!data || data._type !== "concert") return null;
  return (
    <a
      href={`/app/concerts/${data.id}`}
      className="text-accent-lime hover:underline truncate block"
      onClick={(e) => e.stopPropagation()}
    >
      {data.headliner}
    </a>
  );
}

// Full-width renderer for artist sub-rows
function ArtistRowRenderer(params: ICellRendererParams<GridRow>) {
  const data = params.data;
  if (!data || data._type !== "artist") return null;
  const role = data._artistRole;
  const label = ROLE_LABEL[role] ?? role;
  return (
    <div
      style={{ paddingLeft: 72 }}
      className="flex items-center gap-3 h-full text-xs border-b border-border/30"
    >
      <span className="w-1 h-1 rounded-full bg-text-subtle shrink-0" />
      <span className="text-text-base">{data._artistName}</span>
      {label && (
        <span className="font-mono text-text-subtle text-[10px] uppercase tracking-wider">{label}</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status tabs
// ─────────────────────────────────────────────────────────────────────────────

const GRID_STATUS_TABS: { label: string; value: AttendanceStatus | undefined }[] = [
  { label: "All",       value: undefined    },
  { label: "Attended",  value: "attended"   },
  { label: "Attending", value: "attending"  },
  { label: "Interested",value: "interested" },
  { label: "Missed",    value: "missed"     },
];

// ─────────────────────────────────────────────────────────────────────────────
// postSortRows — keep artist sub-rows immediately after their parent concert
// ─────────────────────────────────────────────────────────────────────────────

function postSortRows(params: { nodes: IRowNode<GridRow>[] }) {
  const nodes = params.nodes;
  const concertNodes: IRowNode<GridRow>[] = [];
  const artistsByParent = new Map<string, IRowNode<GridRow>[]>();

  for (const node of nodes) {
    if (node.data?._type === "artist") {
      const pid = node.data._concertId;
      const list = artistsByParent.get(pid) ?? [];
      list.push(node);
      artistsByParent.set(pid, list);
    } else if (node.data?._type === "concert") {
      concertNodes.push(node);
    }
  }

  const final: IRowNode<GridRow>[] = [];
  for (const cn of concertNodes) {
    final.push(cn);
    const artists = artistsByParent.get(cn.data!.id) ?? [];
    artists.sort((a, b) => (a.data as ArtistRow)._artistSetOrder! - (b.data as ArtistRow)._artistSetOrder!);
    final.push(...artists);
  }

  nodes.splice(0, nodes.length, ...final);
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function ConcertGridPage() {
  const qc = useQueryClient();
  const gridApiRef = useRef<GridApi<GridRow> | null>(null);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // ── URL-synced filter state ───────────────────────────────────────────────
  const urlQ      = searchParams.get("q")      ?? "";
  const urlStatus = (searchParams.get("status") ?? "") as AttendanceStatus | "";
  const [inputQ, setInputQ] = useState(urlQ);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setInputQ(urlQ); }, [urlQ]);

  useEffect(() => {
    gridApiRef.current?.setGridOption("quickFilterText", urlQ);
  }, [urlQ]);

  useEffect(() => {
    const api = gridApiRef.current;
    if (!api) return;
    if (urlStatus) {
      api.setColumnFilterModel("status", { type: "equals", filter: urlStatus }).catch(() => null);
    } else {
      api.setColumnFilterModel("status", null).catch(() => null);
    }
    api.onFilterChanged();
  }, [urlStatus]);

  const handleSearch = (val: string): void => {
    setInputQ(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (val.trim()) next.set("q", val.trim()); else next.delete("q");
      setSearchParams(next, { replace: true });
    }, 300);
  };

  const setStatusFilter = (s: AttendanceStatus | undefined): void => {
    const next = new URLSearchParams(searchParams);
    if (s) next.set("status", s); else next.delete("status");
    setSearchParams(next, { replace: true });
  };

  // Fetch ALL concerts
  const concertsQuery = useQuery({
    queryKey: ["concerts/all"],
    queryFn: () => api.listConcerts({ limit: 1000, sort: "date_desc" }),
    staleTime: 30_000,
  });

  // Initial row data — just concert rows (artist rows added via applyTransaction)
  const initialRowData = useMemo<GridRow[]>(
    () => (concertsQuery.data?.concerts ?? []).map(toConcertRow),
    [concertsQuery.data],
  );

  // Whenever query data changes (after save), reset grid
  useEffect(() => {
    const api = gridApiRef.current;
    if (!api || !concertsQuery.data) return;
    api.setGridOption("rowData", initialRowData);
    setDirtyIds(new Set());
    setSaveError(null);
  }, [concertsQuery.data, initialRowData]);

  // ── Expand/collapse ───────────────────────────────────────────────────────

  const toggleExpand = useCallback((concertId: string) => {
    const api = gridApiRef.current;
    if (!api) return;
    const node = api.getRowNode(concertId);
    if (!node?.data || node.data._type !== "concert") return;
    const row = node.data as ConcertRow;

    if (row._expanded) {
      // Collapse: gather and remove artist rows
      const toRemove: ArtistRow[] = [];
      api.forEachNode((n) => {
        if (n.data?._type === "artist" && (n.data as ArtistRow)._concertId === concertId) {
          toRemove.push(n.data as ArtistRow);
        }
      });
      if (toRemove.length > 0) api.applyTransaction({ remove: toRemove });
      api.applyTransaction({ update: [{ ...row, _expanded: false }] });
    } else {
      // Expand: add artist sub-rows
      const artistRows = toArtistRows(concertId, row._artists);
      if (artistRows.length > 0) {
        api.applyTransaction({ add: artistRows });
      }
      api.applyTransaction({ update: [{ ...row, _expanded: true }] });
    }
    // Refresh expand button
    api.refreshCells({ columns: ["_expand"], force: true });
  }, []);

  // ── Grid context ──────────────────────────────────────────────────────────

  const gridContext = useMemo<GridCtx>(() => ({ toggleExpand }), [toggleExpand]);

  // ── Save / revert ─────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: (updates: Parameters<typeof api.batchPatchConcerts>[0]) =>
      api.batchPatchConcerts(updates),
    onSuccess: () => {
      setSaveError(null);
      void qc.invalidateQueries({ queryKey: ["concerts"] });
      void qc.invalidateQueries({ queryKey: ["concerts/stats"] });
      void qc.invalidateQueries({ queryKey: ["concerts/all"] });
    },
    onError: (err) => {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    },
  });

  const handleGridReady = useCallback((e: GridReadyEvent<GridRow>) => {
    gridApiRef.current = e.api;
    if (urlQ) e.api.setGridOption("quickFilterText", urlQ);
    if (urlStatus) {
      e.api.setColumnFilterModel("status", { type: "equals", filter: urlStatus }).catch(() => null);
      e.api.onFilterChanged();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCellChanged = useCallback((e: CellValueChangedEvent<GridRow>) => {
    const data = e.data;
    if (!data || data._type !== "concert") return;
    const dirty = isDirty(data as ConcertRow);
    (data as ConcertRow)._dirty = dirty;
    setDirtyIds((prev) => {
      const next = new Set(prev);
      if (dirty) next.add(data.id);
      else next.delete(data.id);
      return next;
    });
    e.api.refreshCells({ rowNodes: [e.node!], force: true });
  }, []);

  const handleSave = (): void => {
    const gridApi = gridApiRef.current;
    if (!gridApi) return;
    type BatchUpdate = Parameters<typeof api.batchPatchConcerts>[0][number];
    const updates: BatchUpdate[] = [];
    gridApi.forEachNode((node) => {
      const r = node.data;
      if (!r || r._type !== "concert" || !r._dirty) return;
      const row = r as ConcertRow;
      updates.push({
        id: row.id,
        ...(row.date !== row._origDate ? { date: row.date } : {}),
        ...(row.venueName !== row._origVenueName ? { venueName: row.venueName } : {}),
        ...(row.venueCity !== row._origVenueCity ? { venueCity: row.venueCity } : {}),
        ...(row.concertType !== row._origConcertType ? { type: row.concertType } : {}),
        ...(row.status !== row._origStatus ? { status: row.status } : {}),
        ...(row.personalNotes !== row._origNotes ? { personalNotes: row.personalNotes } : {}),
        ...(row.ticketPricePaid !== row._origTicket ? { ticketPricePaid: row.ticketPricePaid } : {}),
        ...(row.ticketPriceCurrency !== row._origCurrency ? { ticketPriceCurrency: row.ticketPriceCurrency } : {}),
      });
    });
    if (updates.length > 0) saveMutation.mutate(updates);
  };

  const handleRevert = (): void => {
    setDirtyIds(new Set());
    const gridApi = gridApiRef.current;
    if (gridApi && concertsQuery.data) {
      gridApi.setGridOption("rowData", initialRowData);
    }
  };

  // ── Column definitions ────────────────────────────────────────────────────

  const colDefs = useMemo<(ColDef<GridRow> | ColGroupDef<GridRow>)[]>(
    () => [
      // Expand toggle
      {
        field: "_expand" as keyof GridRow,
        headerName: "",
        width: 52,
        pinned: "left",
        editable: false,
        sortable: false,
        filter: false,
        resizable: false,
        suppressMovable: true,
        cellRenderer: ExpandBtn,
        cellClass: "flex items-center justify-center",
      },

      // Date
      {
        field: "date",
        headerName: "Date",
        width: 130,
        sortable: true,
        filter: "agDateColumnFilter",
        editable: (p) => p.data?._type === "concert",
        cellEditor: "agTextCellEditor",
        valueFormatter: (p) => (p.value ? fmtDate(p.value as string) : ""),
        cellClass: "font-mono text-xs",
        pinned: "left",
      },

      // Show (link, display-only)
      {
        field: "headliner",
        headerName: "Show",
        flex: 2,
        minWidth: 150,
        sortable: true,
        filter: "agTextColumnFilter",
        editable: false,
        cellRenderer: ShowCell,
      },

      // Venue group
      {
        headerName: "Venue",
        children: [
          {
            field: "venueName",
            headerName: "Name",
            flex: 1,
            minWidth: 120,
            sortable: true,
            filter: "agTextColumnFilter",
            editable: (p) => p.data?._type === "concert",
            cellEditor: "agTextCellEditor",
            cellClass: "text-xs",
          },
          {
            field: "venueCity",
            headerName: "City",
            width: 100,
            sortable: true,
            filter: "agTextColumnFilter",
            editable: (p) => p.data?._type === "concert",
            cellEditor: "agTextCellEditor",
            cellClass: "text-xs text-text-muted",
          },
        ],
      },

      // Type
      {
        field: "concertType",
        headerName: "Type",
        width: 110,
        sortable: true,
        editable: (p) => p.data?._type === "concert",
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: ["concert", "festival_day"] },
        valueFormatter: (p) => (p.value === "festival_day" ? "Festival day" : p.value ?? ""),
        cellClass: "text-xs font-mono text-text-muted",
      },

      // Status
      {
        field: "status",
        headerName: "Status",
        width: 130,
        sortable: true,
        filter: "agTextColumnFilter",
        editable: (p) => p.data?._type === "concert",
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: ATTENDANCE_STATUSES },
        cellClass: (p: { value: string }) => {
          const map: Record<string, string> = {
            attended:  "text-accent-lime",
            attending: "text-yellow-400",
            missed:    "text-red-400",
            interested:"text-purple-400",
            cancelled: "text-text-subtle",
            dismissed: "text-text-subtle",
          };
          return `font-mono text-xs capitalize ${map[p.value] ?? "text-text-muted"}`;
        },
      },

      // Ticket group
      {
        headerName: "Ticket",
        children: [
          {
            field: "ticketPricePaid",
            headerName: "Price",
            width: 96,
            sortable: true,
            editable: (p) => p.data?._type === "concert",
            cellEditor: "agNumberCellEditor",
            cellEditorParams: { min: 0, precision: 0 },
            valueFormatter: (p) =>
              p.value != null ? `$${(p.value / 100).toFixed(2)}` : "",
            cellClass: "font-mono text-xs text-text-muted",
          },
          {
            field: "ticketPriceCurrency",
            headerName: "Cur",
            width: 68,
            editable: (p) => p.data?._type === "concert",
            cellEditor: "agTextCellEditor",
            valueFormatter: (p) => p.value ?? "",
            cellClass: "font-mono text-xs text-text-muted uppercase",
          },
        ],
      },

      // Notes
      {
        field: "personalNotes",
        headerName: "Notes",
        flex: 2,
        minWidth: 160,
        editable: (p) => p.data?._type === "concert",
        cellEditor: "agLargeTextCellEditor",
        cellEditorPopup: true,
        cellEditorParams: { maxLength: 4096, rows: 6, cols: 50 },
        valueFormatter: (p) => p.value ?? "",
        cellClass: "text-xs text-text-muted italic",
      },
    ],
    [],
  );

  const defaultColDef = useMemo<ColDef>(
    () => ({ resizable: true, suppressMovable: false }),
    [],
  );

  const getRowClass = useCallback(
    (p: RowClassParams<GridRow>) =>
      p.data?._type === "concert" && (p.data as ConcertRow)._dirty
        ? "ag-row-dirty"
        : p.data?._type === "artist"
          ? "ag-row-artist"
          : undefined,
    [],
  );

  const dirtyCount = dirtyIds.size;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar row 1 */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div>
          <h1 className="font-display uppercase text-2xl leading-none">Grid editor</h1>
          <p className="text-xs text-text-muted font-mono mt-0.5">
            Click any cell to edit · ▸ to expand artists · changes highlighted until saved
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {dirtyCount > 0 && (
            <>
              <span className="text-xs font-mono text-accent-lime">
                {dirtyCount} unsaved {dirtyCount === 1 ? "change" : "changes"}
              </span>
              <button
                onClick={handleRevert}
                className="text-xs font-mono px-3 py-1.5 rounded border border-border text-text-muted hover:text-text-base transition-colors"
              >
                Revert
              </button>
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="text-xs font-mono px-4 py-1.5 rounded bg-accent-lime text-bg font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saveMutation.isPending ? "Saving…" : `Save ${dirtyCount}`}
              </button>
            </>
          )}
          {saveError && (
            <span className="text-xs font-mono text-accent-pink">{saveError}</span>
          )}
          <Link
            to="/app/concerts"
            className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors border border-border rounded px-3 py-1.5"
          >
            ← Card view
          </Link>
        </div>
      </div>

      {/* Toolbar row 2 — status tabs + quick search */}
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <div className="flex gap-1 rounded border border-border p-0.5 bg-surface">
          {GRID_STATUS_TABS.map((tab) => (
            <button
              key={tab.label}
              onClick={() => setStatusFilter(tab.value)}
              className={clsx(
                "px-3 py-1 rounded text-xs font-mono transition-colors",
                (urlStatus || undefined) === tab.value
                  ? "bg-accent-lime text-bg font-bold"
                  : "text-text-muted hover:text-text-base",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Quick search all columns…"
          value={inputQ}
          onChange={(e) => handleSearch(e.target.value)}
          className="flex-1 min-w-40 max-w-64 rounded border border-border bg-surface px-3 py-1.5 text-xs text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
        />
      </div>

      {/* Loading / error */}
      {concertsQuery.isLoading && (
        <div className="flex-1 flex items-center justify-center text-text-subtle font-mono text-sm animate-pulse">
          Loading…
        </div>
      )}
      {concertsQuery.isError && (
        <div className="flex-1 flex items-center justify-center text-accent-pink font-mono text-sm">
          Failed to load concerts.
        </div>
      )}

      {/* Grid */}
      {concertsQuery.isSuccess && (
        <div
          className="ag-theme-alpine-dark flex-1 rounded-lg overflow-hidden border border-border"
          style={{ minHeight: 520 }}
        >
          <AgGridReact<GridRow>
            rowData={initialRowData}
            columnDefs={colDefs}
            defaultColDef={defaultColDef}
            onGridReady={handleGridReady}
            onCellValueChanged={handleCellChanged}
            getRowClass={getRowClass}
            getRowId={(p) => p.data.id}
            context={gridContext}
            isFullWidthRow={(p) => p.rowNode.data?._type === "artist"}
            fullWidthCellRenderer={ArtistRowRenderer}
            postSortRows={postSortRows}
            rowHeight={36}
            headerHeight={36}
            suppressRowClickSelection
            enableCellTextSelection
            stopEditingWhenCellsLoseFocus
            undoRedoCellEditing
            undoRedoCellEditingLimit={50}
            domLayout="autoHeight"
          />
        </div>
      )}

      {/* Custom styles */}
      <style>{`
        .ag-theme-alpine-dark .ag-row-dirty {
          background-color: rgba(168, 255, 62, 0.07) !important;
          border-left: 2px solid #A8FF3E !important;
        }
        .ag-theme-alpine-dark .ag-row-dirty:hover {
          background-color: rgba(168, 255, 62, 0.11) !important;
        }
        .ag-theme-alpine-dark .ag-row-artist {
          background-color: rgba(255, 255, 255, 0.02) !important;
          cursor: default;
        }
        .ag-theme-alpine-dark .ag-row-artist:hover {
          background-color: rgba(255, 255, 255, 0.03) !important;
        }
        .ag-theme-alpine-dark {
          --ag-background-color: #141416;
          --ag-odd-row-background-color: #181819;
          --ag-header-background-color: #1C1C1F;
          --ag-border-color: #303034;
          --ag-row-hover-color: #1E1E21;
          --ag-selected-row-background-color: #222226;
          --ag-font-size: 12px;
          --ag-font-family: 'JetBrains Mono', 'Fira Code', monospace;
          --ag-foreground-color: #F4F1EB;
          --ag-header-foreground-color: #9C9A93;
          --ag-range-selection-border-color: #A8FF3E;
          --ag-input-focus-border-color: #A8FF3E;
          --ag-cell-horizontal-padding: 10px;
          --ag-column-select-indent-size: 14px;
        }
        .ag-theme-alpine-dark .ag-header-group-cell {
          color: #A8FF3E;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
      `}</style>
    </div>
  );
}

