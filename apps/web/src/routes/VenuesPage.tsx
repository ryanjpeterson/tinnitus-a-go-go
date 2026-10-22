/**
 * Venue index — photo cards for every venue in the log.
 *
 * Page and search live in the URL (?page=&q=) so the back button restores
 * the exact view you left.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useListParams } from "@/lib/useListParams";
import { plural } from "@/lib/format";
import { EmptyState, Loading, MediaCard, PageHeader, Pager, SearchField, VenueViewSwitch } from "@/components/ui/kit";

const PAGE_SIZE = 30;

export function VenuesPage() {
  const { page, q, inputQ, onSearch, setPage } = useListParams();

  const venuesQuery = useQuery({
    queryKey: ["venues", { q, page }],
    queryFn: () => api.listVenues({ q: q || undefined, page, limit: PAGE_SIZE }),
    staleTime: 30_000,
  });

  const { venues = [], total = 0, totalPages = 0 } = venuesQuery.data ?? {};

  return (
    <div>
      <PageHeader title="Venues" count={total} actions={<VenueViewSwitch view="list" />} />
      <div className="mb-5">
        <SearchField value={inputQ} onChange={onSearch} placeholder="Search venues or cities" />
      </div>

      {venuesQuery.isLoading ? (
        <Loading />
      ) : venues.length === 0 ? (
        <EmptyState
          title={q ? "No venues match." : "No venues yet."}
          body={q ? "Try a different spelling." : "Import your CSV to populate venues."}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {venues.map((v) => (
              <MediaCard
                key={v.id}
                to={`/venues/${v.slug}`}
                name={v.name}
                imageUrl={v.imageUrl}
                sub={[v.city, v.region].filter(Boolean).join(", ") || undefined}
                meta={plural(v.showCount, "show")}
              />
            ))}
          </div>
          <Pager page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </div>
  );
}
