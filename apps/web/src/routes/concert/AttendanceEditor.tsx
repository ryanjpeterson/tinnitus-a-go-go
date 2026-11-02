/** Show page: your attendance — status, notes, ticket price. */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api, type ConcertDetail } from "@/lib/api";
import type { AttendanceStatus } from "@tagg/shared";

const STATUS_CHIP: Record<AttendanceStatus, { label: string; classes: string }> = {
  attended:  { label: "Attended",  classes: "bg-lime-950 text-accent-lime border-lime-700"    },
  attending: { label: "Attending", classes: "bg-yellow-950 text-yellow-400 border-yellow-700" },
  interested:{ label: "Interested",classes: "bg-purple-950 text-purple-400 border-purple-800" },
  missed:    { label: "Missed",    classes: "bg-red-950 text-red-400 border-red-800"          },
  cancelled: { label: "Cancelled", classes: "bg-surface-2 text-text-subtle border-border"     },
};

// ─────────────────────────────────────────────────────────────────────────────
// Attendance editor
// ─────────────────────────────────────────────────────────────────────────────

export function AttendanceEditor({ concertId, attendance }: { concertId: string; attendance: ConcertDetail["attendance"] }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState(attendance?.personalNotes ?? "");
  // "" = not logged yet. Starts on the saved status so the picker shows the real value.
  const [selectedStatus, setSelectedStatus] = useState<AttendanceStatus | "">(attendance?.status ?? "");

  // Derived from the saved values, so reverting an edit by hand turns the
  // button back off instead of leaving a "Save changes" that does nothing.
  const updates: Parameters<typeof api.patchConcert>[1] = {};
  if (selectedStatus !== "" && selectedStatus !== attendance?.status) updates.status = selectedStatus;
  if (notes !== (attendance?.personalNotes ?? "")) updates.personalNotes = notes || null;
  // A show with no attendance yet needs a status before anything can be saved.
  const hasChanges = Object.keys(updates).length > 0 && selectedStatus !== "";

  const patch = useMutation({
    mutationFn: (body: Parameters<typeof api.patchConcert>[1]) => api.patchConcert(concertId, body),
    // Returning the detail refetch keeps the button in "Saving…" until the new
    // attendance arrives, rather than flashing "Save changes" against stale props.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["concerts"] });
      return qc.invalidateQueries({ queryKey: ["concerts", concertId] });
    },
  });

  const handleSave = () => {
    if (hasChanges) patch.mutate(updates);
  };

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="h-section">Attendance</span>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block mb-1 label">Status</label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as AttendanceStatus | "")}
            className="w-full field h-11"
          >
            {!attendance && <option value="" disabled>Not logged — pick a status</option>}
            {(["attending", "interested", "attended", "missed", "cancelled"] as AttendanceStatus[]).map(
              (s) => <option key={s} value={s}>{STATUS_CHIP[s].label}</option>,
            )}
          </select>
        </div>

        <div>
          <label className="block mb-1 label">Personal notes</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add your notes about this show..."
            className="w-full resize-none field py-2.5"
          />
        </div>

        {attendance?.ticketPricePaid != null && (
          <div className="text-sm text-text-subtle">
            Ticket: {(attendance.ticketPricePaid / 100).toFixed(2)} {attendance.ticketPriceCurrency ?? ""}
          </div>
        )}

        {patch.isError && (
          <p className="text-sm text-accent-pink">
            {patch.error instanceof Error ? patch.error.message : "Failed to save."}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={patch.isPending || !hasChanges}
          className={clsx(
            "text-xs  px-4 py-1.5 rounded font-bold transition-opacity disabled:opacity-50",
            hasChanges
              ? "bg-accent-lime text-on-accent hover:opacity-90"
              : "bg-surface-2 text-text-muted"
          )}
        >
          {patch.isPending ? "Saving…" : hasChanges ? "Save changes" : "No changes"}
        </button>
      </div>
    </div>
  );
}
