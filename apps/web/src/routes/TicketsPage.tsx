/**
 * TicketsPage — every ticket stub, oldest show first. Photos become stubs with
 * the ticket toggle on a show's photos (admin).
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { EmptyState, ImageViewer, Loading, PageHeader } from "@/components/ui/kit";
import { fmtDate } from "@/lib/format";

export function TicketsPage() {
  const q = useQuery({ queryKey: ["tickets"], queryFn: api.listTickets });
  const [open, setOpen] = useState<string | null>(null);
  if (q.isLoading) return <Loading />;
  const tickets = q.data?.tickets ?? [];
  const opened = tickets.find((t) => t.id === open);

  return (
    <div>
      <PageHeader eyebrow="Your collection" title="Ticket stubs" count={tickets.length} />
      {tickets.length === 0 ? (
        <EmptyState title="No ticket stubs yet."
          body="On a show's photos, tap 🎟 on a picture of your ticket to add it here." />
      ) : (
        <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3">
          {tickets.map((t) => (
            <figure key={t.id} className="card break-inside-avoid overflow-hidden">
              <button onClick={() => setOpen(t.id)} className="block w-full" aria-label="View full size">
                <img src={t.urls.medium ?? t.urls.thumb ?? t.urls.original} alt="" loading="lazy"
                  className="w-full transition-transform duration-300 hover:scale-[1.02]"
                  style={t.width && t.height ? { aspectRatio: `${t.width} / ${t.height}` } : undefined} />
              </button>
              <figcaption className="p-3">
                <Link to={`/shows/${t.show.slug}`} className="line-clamp-2 text-sm font-semibold hover:text-accent-lime">
                  {t.show.title ?? "Show"}
                </Link>
                <p className="mt-0.5 truncate text-xs text-text-subtle">{[fmtDate(t.show.date), t.show.venue].filter(Boolean).join(" · ")}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {opened && <ImageViewer src={opened.urls.large ?? opened.urls.original} alt={`Ticket — ${opened.show.title ?? "show"}`} onClose={() => setOpen(null)} />}
    </div>
  );
}
