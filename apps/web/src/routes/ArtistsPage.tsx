/**
 * Artist index — every artist in the log as a list of rows.
 *
 * Page and search live in the URL (?page=&q=) so the back button restores
 * the exact view you left.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useListParams } from "@/lib/useListParams";
import { plural } from "@/lib/format";
import { EmptyState, EntityRow, List, Loading, PageHeader, Pager, SearchField } from "@/components/ui/kit";

const PAGE_SIZE = 40;

export function ArtistsPage() {
  const { page, q, inputQ, onSearch, setPage } = useListParams();

  const artistsQuery = useQuery({
    queryKey: ["artists", { q, page }],
    queryFn: () => api.listArtists({ q: q || undefined, page, limit: PAGE_SIZE }),
    staleTime: 30_000,
  });

  const { artists = [], total = 0, totalPages = 0 } = artistsQuery.data ?? {};

  return (
    <div>
      <PageHeader title="Artists" count={total} />
      <div className="mb-5">
        <SearchField value={inputQ} onChange={onSearch} placeholder="Search artists" />
      </div>

      {artistsQuery.isLoading ? (
        <Loading />
      ) : artists.length === 0 ? (
        <EmptyState
          title={q ? "No artists match." : "No artists yet."}
          body={q ? "Try a different spelling." : "Import your CSV to populate artists."}
        />
      ) : (
        <>
          <List>
            {artists.map((a) => (
              <EntityRow
                key={a.id}
                to={`/artists/${a.slug}`}
                name={a.name}
                imageUrl={a.imageUrl}
                // Count first so it survives truncation on narrow screens
                // Attended shows only; otherwise say what's going on with them.
                sub={[a.showCount > 0 ? `Seen ${a.showCount === 1 ? "once" : `${a.showCount}×`}` : a.upcomingCount > 0 ? "Coming up" : "Not seen yet", a.genre].filter(Boolean).join(" · ")}
                round
              />
            ))}
          </List>
          <Pager page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </div>
  );
}
