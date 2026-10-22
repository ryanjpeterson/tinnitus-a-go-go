/**
 * FestivalPicker — put shows into a festival: pick an existing one (search),
 * or start a new one with a name. The shows then take the festival's name,
 * flyer and (if they have none) venue; take them out again from the show or
 * festival page.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Chevron, SearchField, Sheet } from "@/components/ui/kit";

export function FestivalPicker({ concertIds, suggestedName, onClose, onDone }: {
  concertIds: string[];
  /** Pre-filled name for a new festival. */
  suggestedName: string;
  onClose: () => void;
  /** After grouping; navigates to the festival when omitted. */
  onDone?: (slug: string) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [name, setName] = useState(suggestedName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const festivals = useQuery({
    queryKey: ["festivals", { q, picker: true }],
    queryFn: () => api.listFestivals({ q: q || undefined, page: 1, limit: 12 }),
    staleTime: 30_000,
  });

  const finish = async (slug: string) => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["concerts"] }),
      qc.invalidateQueries({ queryKey: ["festivals"] }),
      qc.invalidateQueries({ queryKey: ["admin", "festival-suggestions"] }),
    ]);
    onClose();
    if (onDone) onDone(slug);
    else navigate(`/festivals/${slug}`);
  };

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    try { await finish(await fn()); }
    catch (err) { setError(err instanceof Error ? err.message : "Couldn't add to the festival."); }
    finally { setBusy(false); }
  };

  const shows = `${concertIds.length} show${concertIds.length === 1 ? "" : "s"}`;

  return (
    <Sheet title="Add to festival" subtitle={`${shows} will take the festival's name and flyer.`} onClose={onClose}>
      <div className="space-y-5 p-4 sm:p-5">
        <section className="space-y-2">
          <p className="eyebrow">New festival</p>
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bluesfest 2026"
              className="field h-12 min-w-0 flex-1 sm:h-11" />
            <Button disabled={busy || !name.trim()} className="h-12 sm:h-11"
              onClick={() => void run(async () => (await api.groupIntoFestival(name.trim(), concertIds)).slug)}>
              Create
            </Button>
          </div>
          <p className="text-xs text-text-subtle">Its dates and venue come from the shows. A festival with this name already? They join it.</p>
        </section>

        <section className="space-y-2">
          <p className="eyebrow">Or an existing festival</p>
          <SearchField value={q} onChange={setQ} placeholder="Search festivals" />
          <div className="card divide-y divide-border overflow-hidden">
            {(festivals.data?.festivals ?? []).map((f) => (
              <button key={f.id} disabled={busy}
                onClick={() => void run(async () => { await api.addShowsToFestival(f.slug, concertIds); return f.slug; })}
                className="group flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2/70 disabled:opacity-60">
                <div className="h-11 w-9 shrink-0 overflow-hidden rounded-md bg-surface-2">
                  {f.flyerUrl && <img src={f.flyerUrl} alt="" loading="lazy" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold group-hover:text-accent-lime">{f.name}</p>
                  <p className="truncate text-sm text-text-muted">{[f.venue?.name, f.startDate?.slice(0, 4)].filter(Boolean).join(" · ")}</p>
                </div>
                <Chevron className="text-text-subtle" />
              </button>
            ))}
            {festivals.data && festivals.data.festivals.length === 0 && (
              <p className="p-4 text-sm text-text-subtle">No festivals match.</p>
            )}
          </div>
        </section>
        {error && <p className="text-sm text-accent-pink">{error}</p>}
      </div>
    </Sheet>
  );
}
