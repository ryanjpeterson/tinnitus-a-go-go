/**
 * Tinnitus's UI kit: jimbo.ui's kit (./jimbo-kit, an exact copy of the
 * reference — update it by copying) plus Tinnitus's own pieces: attendance
 * statuses mapped onto jimbo.ui's tones, an EventRow that takes an attendance
 * status, the Venues list/map switch and the share button.
 */

import { useState, type ComponentProps } from "react";
import type { AttendanceStatus } from "@tagg/shared";
import { cn } from "@/lib/cn";
import { Badge, EventRow as JimboEventRow, TONES, ViewSwitch, type RowStatus, type Tone } from "./jimbo-kit";

export * from "./jimbo-kit";

// ─────────────────────────────────────────────────────────────────────────────
// Attendance status — one tone per status, the same everywhere
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_TONES: Record<AttendanceStatus, { label: string; tone: Tone }> = {
  attended:   { label: "Attended",   tone: "accent" },
  attending:  { label: "Attending",  tone: "yellow" },
  interested: { label: "Interested", tone: "purple" },
  missed:     { label: "Missed",     tone: "red" },
  cancelled:  { label: "Cancelled",  tone: "muted" },
};

export const STATUS = Object.fromEntries(
  Object.entries(STATUS_TONES).map(([k, v]) => [k, { ...v, ...TONES[v.tone] }]),
) as Record<AttendanceStatus, { label: string; tone: Tone } & (typeof TONES)[Tone]>;

export function StatusBadge({ status, className }: { status: AttendanceStatus; className?: string }) {
  const s = STATUS[status] ?? STATUS.cancelled;
  return <Badge tone={s.tone} className={className}>{s.label}</Badge>;
}

/** An attendance status as the kit's row status (tone + label). */
export const rowStatus = (status?: AttendanceStatus | null): RowStatus | null =>
  status ? { tone: STATUS[status].tone, label: STATUS[status].label } : null;

/** A show as a row — jimbo.ui's EventRow with an attendance status. */
export function EventRow({ status, ...rest }: Omit<ComponentProps<typeof JimboEventRow>, "status"> & { status?: AttendanceStatus | null }) {
  return <JimboEventRow {...rest} status={rowStatus(status)} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Venues List | Map switch — the Venues tab has two views
// ─────────────────────────────────────────────────────────────────────────────

export function VenueViewSwitch({ view, floating = false }: { view: "list" | "map"; floating?: boolean }) {
  return (
    <ViewSwitch current={view === "list" ? "/venues" : "/map"} floating={floating}
      options={[{ to: "/venues", label: "List" }, { to: "/map", label: "Map" }]} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Share — makes a story-sized image and opens the share sheet
// ─────────────────────────────────────────────────────────────────────────────

export function ShareButton({ card, className }: { card: () => import("@/lib/shareCard").ShareCard; className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { shareCard } = await import("@/lib/shareCard");
          await shareCard(card());
        } finally {
          setBusy(false);
        }
      }}
      className={cn("btn btn-sm btn-secondary h-10", className)}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
      </svg>
      {busy ? "Making image…" : "Share"}
    </button>
  );
}
