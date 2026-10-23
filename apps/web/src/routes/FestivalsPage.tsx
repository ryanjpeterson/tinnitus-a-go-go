/**
 * Festival index — flyer cards for every festival.
 *
 * All filter/page state lives in the URL (?page=) so the browser back
 * button always restores the exact view you left.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type FestivalListItem } from "@/lib/api";
import { useListParams } from "@/lib/useListParams";
import { useAuth } from "@/lib/auth-context";
import { plural } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { EmptyState, Loading, MediaCard, PageHeader, Pager, StatusBadge } from "@/components/ui/kit";
import { AddFestivalModal } from "./AddFestivalModal";

const PAGE_SIZE = 60;

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function fmtDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "";
  if (start && !end) return fmtDate(start);
  if (!start && end) return fmtDate(end);

  const [sy, sm, sd] = start!.split("-").map(Number);
  const [ey, em, ed] = end!.split("-").map(Number);

  // Same day: just show the single date
  if (sy === ey && sm === em && sd === ed) {
    return fmtDate(start);
  }

  const startDate = new Date(Date.UTC(sy!, sm! - 1, sd!));
  const endDate = new Date(Date.UTC(ey!, em! - 1, ed!));

  const startMonth = startDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const endMonth = endDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const year = startDate.toLocaleDateString("en-US", { year: "numeric", timeZone: "UTC" });

  if (sm === em && sy === ey) {
    // Same month: "Jul 10 - 20, 2025"
    return `${startMonth} ${sd} - ${ed}, ${year}`;
  }
  // Different months: "Jul 10 - Aug 5, 2025"
  return `${startMonth} ${sd} - ${endMonth} ${ed}, ${year}`;
}

function NewFestivalCard({ festival }: { festival: FestivalListItem }) {
  const venue = festival.venue ? [festival.venue.name, festival.venue.city].filter(Boolean).join(" · ") : null;
  return (
    <MediaCard
      to={`/festivals/${festival.slug}`}
      name={festival.name}
      imageUrl={festival.flyerUrl}
      aspect="portrait"
      contain
      sub={fmtDateRange(festival.startDate, festival.endDate) || venue || undefined}
      meta={[venue && festival.startDate ? venue : null, festival.dayCount > 1 ? plural(festival.dayCount, "day") : null, plural(festival.artistCount, "artist")].filter(Boolean).join(" · ")}
      badge={festival.attendance ? <StatusBadge status={festival.attendance.status} /> : undefined}
    />
  );
}

export function FestivalsPage() {
  const { page, setPage } = useListParams();
  const { user } = useAuth();
  const [addOpen, setAddOpen] = useState(false);

  const festivalsQuery = useQuery({
    queryKey: ["festivals", { page }],
    queryFn: () => api.listFestivals({ page, limit: PAGE_SIZE }),
    staleTime: 30_000,
  });

  const festivals = festivalsQuery.data?.festivals ?? [];
  const total = festivalsQuery.data?.total ?? 0;
  const totalPages = festivalsQuery.data?.totalPages ?? 0;
  const canAddNew = user?.isAdmin ?? false;

  return (
    <div>
      {addOpen && <AddFestivalModal onClose={() => setAddOpen(false)} />}

      <PageHeader
        title="Festivals"
        count={total}
        actions={canAddNew && (
          <Button size="md" onClick={() => setAddOpen(true)}>+ Add festival</Button>
        )}
      />

      {festivalsQuery.isLoading ? (
        <Loading />
      ) : festivalsQuery.isError && festivals.length === 0 ? (
        <EmptyState tone="error" title="Couldn't load festivals." body="Pull down to try again." />
      ) : festivals.length === 0 ? (
        <EmptyState
          title="No festivals yet."
          action={canAddNew && <Button onClick={() => setAddOpen(true)}>Add your first festival</Button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {festivals.map((f) => <NewFestivalCard key={f.id} festival={f} />)}
          </div>
          <Pager page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </div>
  );
}
