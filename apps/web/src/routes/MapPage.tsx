/**
 * MapPage — full-screen map showing all venues with coordinates.
 *
 * Uses the same dark Google Maps styling as VenueMap, with clustered markers
 * when zoomed out and individual venue pins when zoomed in.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { APIProvider, ControlPosition, Map, Marker, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { api, type VenueMapItem } from "@/lib/api";
import { Chevron, EmptyState, Loading, PageHeader, SearchField, VenueViewSwitch } from "@/components/ui/kit";

const API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? "";

// Dark map style — minimal with green accents
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DARK_STYLES: any[] = [
  { elementType: "geometry",              stylers: [{ color: "#141416" }] },
  { elementType: "labels.text.fill",      stylers: [{ color: "#4a6b3a" }] },
  { elementType: "labels.text.stroke",    stylers: [{ color: "#0e0e10" }] },
  { featureType: "administrative",        elementType: "geometry",           stylers: [{ color: "#1C1C1F" }] },
  { featureType: "administrative",        elementType: "labels.text.fill",   stylers: [{ color: "#4a6b3a" }] },
  { featureType: "landscape",             elementType: "geometry",           stylers: [{ color: "#141416" }] },
  { featureType: "poi",                   stylers: [{ visibility: "off" }] },
  { featureType: "road",                  elementType: "geometry",           stylers: [{ color: "#1f2a1f" }] },
  { featureType: "road",                  elementType: "labels.text.fill",   stylers: [{ color: "#4a6b3a" }] },
  { featureType: "road.arterial",         elementType: "geometry",           stylers: [{ color: "#243024" }] },
  { featureType: "road.highway",          elementType: "geometry",           stylers: [{ color: "#2a3d2a" }] },
  { featureType: "road.highway",          elementType: "geometry.stroke",    stylers: [{ color: "#141416" }] },
  { featureType: "transit",               stylers: [{ visibility: "off" }] },
  { featureType: "water",                 elementType: "geometry.fill",      stylers: [{ color: "#0a1a0f" }] },
  { featureType: "water",                 elementType: "labels.text.fill",   stylers: [{ color: "#2d4a2d" }] },
];

// Pink circle marker icons as data URLs
const PINK_MARKER_ICON = "data:image/svg+xml," + encodeURIComponent(`
  <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="8" fill="#FF3D6E" stroke="#ff6b8a" stroke-width="2"/>
  </svg>
`);

const PINK_MARKER_ICON_SELECTED = "data:image/svg+xml," + encodeURIComponent(`
  <svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
    <circle cx="14" cy="14" r="11" fill="#FF3D6E" stroke="#ff8fa8" stroke-width="3"/>
  </svg>
`);

// Venue info popup
function VenuePopup({ venue, here, onSelect, onClose }: {
  venue: VenueMapItem;
  /** Every venue on this spot (renamed venues often share one). */
  here: VenueMapItem[];
  onSelect: (v: VenueMapItem) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute bottom-[calc(6rem+env(safe-area-inset-bottom))] left-4 right-4 z-10 sm:bottom-4 sm:left-auto sm:right-4 sm:w-80">
      <div className="card p-4 shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Link
              to={`/venues/${venue.slug}`}
              className="font-display text-xl hover:text-accent-lime transition-colors block truncate"
            >
              {venue.name}
            </Link>
            {(venue.city || venue.region) && (
              <p className="text-sm text-text-muted mt-0.5">
                {[venue.city, venue.region].filter(Boolean).join(", ")}
              </p>
            )}
            <p className="text-sm text-text-subtle mt-1">
              {venue.showCount} {venue.showCount === 1 ? "show" : "shows"}
            </p>
            {here.length > 1 && (
              <p className="mt-2 text-sm text-text-muted">
                Also here:{" "}
                {here.filter((v) => v.id !== venue.id).map((v, i) => (
                  <span key={v.id}>
                    {i > 0 && ", "}
                    <button onClick={() => onSelect(v)} className="font-semibold text-text-base underline-offset-2 hover:text-accent-lime hover:underline">{v.name}</button>
                  </span>
                ))}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="-mr-2 -mt-2 flex h-10 w-10 items-center justify-center rounded-full text-text-subtle transition-colors hover:text-text-base"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        <Link
          to={`/venues/${venue.slug}`}
          className="mt-3 h-11 btn btn-primary"
        >
          View venue
        </Link>
      </div>
    </div>
  );
}

// Map content with markers

/** Venues on the same spot (within ~10 m) share one pin. */
function groupBySpot(venues: VenueMapItem[]): VenueMapItem[][] {
  const groups = new globalThis.Map<string, VenueMapItem[]>();
  for (const v of venues) {
    const key = `${v.lat.toFixed(4)},${v.lng.toFixed(4)}`;
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  // Busiest venue first, so it's the one a shared pin opens.
  return [...groups.values()].map((g) => g.sort((x, y) => y.showCount - x.showCount));
}

function MapContent({ venues, selected, onSelect }: {
  venues: VenueMapItem[];
  selected: VenueMapItem | null;
  onSelect: (v: VenueMapItem | null) => void;
}) {
  // Marker images anchor at their bottom-centre by default, which drew every
  // dot ~10 px north of its venue; anchor the circles at their centre instead.
  const core = useMapsLibrary("core");
  const spots = useMemo(() => groupBySpot(venues), [venues]);
  if (!core) return null;
  const icon = (selectedHere: boolean) => {
    const size = selectedHere ? 28 : 20;
    return {
      url: selectedHere ? PINK_MARKER_ICON_SELECTED : PINK_MARKER_ICON,
      size: new core.Size(size, size),
      scaledSize: new core.Size(size, size),
      anchor: new core.Point(size / 2, size / 2),
      labelOrigin: new core.Point(size / 2, size / 2),
    };
  };
  return (
    <>
      {spots.map((group) => {
        const first = group[0]!;
        const selectedHere = !!selected && group.some((v) => v.id === selected.id);
        return (
          <Marker
            key={first.id}
            position={{ lat: first.lat, lng: first.lng }}
            title={group.map((v) => v.name).join(" / ")}
            onClick={() => onSelect(selectedHere ? selected : first)}
            icon={icon(selectedHere)}
            label={group.length > 1 ? { text: String(group.length), color: "#ffffff", fontSize: "11px", fontWeight: "700" } : undefined}
            zIndex={selectedHere ? 10 : 1}
          />
        );
      })}
      {selected && (
        <VenuePopup
          venue={selected}
          here={spots.find((g) => g.some((v) => v.id === selected.id)) ?? [selected]}
          onSelect={onSelect}
          onClose={() => onSelect(null)}
        />
      )}
    </>
  );
}

/** A request to move the map: fit a set of venues (a city, or everything) or zoom to one. */
type Focus = { venues: VenueMapItem[]; seq: number };

/** Moves the map whenever `focus` changes, leaving room for the panel on desktop. */
function FocusController({ focus }: { focus: Focus | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !focus || focus.venues.length === 0) return;
    if (focus.venues.length === 1) {
      const v = focus.venues[0]!;
      map.panTo({ lat: v.lat, lng: v.lng });
      map.setZoom(Math.max(map.getZoom() ?? 0, 15));
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const v of focus.venues) bounds.extend({ lat: v.lat, lng: v.lng });
    const desktop = window.matchMedia("(min-width: 640px)").matches;
    map.fitBounds(bounds, desktop ? { top: 60, right: 60, bottom: 60, left: 400 } : { top: 90, right: 30, bottom: 40, left: 30 });
  }, [map, focus]);
  return null;
}

interface CityGroup {
  key: string;
  label: string;
  venues: VenueMapItem[];
  shows: number;
}

function groupByCity(venues: VenueMapItem[]): CityGroup[] {
  // globalThis.Map: the map library's <Map> component shadows the built-in here.
  const groups = new globalThis.Map<string, CityGroup>();
  for (const v of venues) {
    const label = [v.city, v.region].filter(Boolean).join(", ") || "Unknown city";
    const g = groups.get(label) ?? { key: label, label, venues: [], shows: 0 };
    g.venues.push(v);
    g.shows += v.showCount;
    groups.set(label, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, venues: g.venues.sort((a, b) => b.showCount - a.showCount || a.name.localeCompare(b.name)) }))
    .sort((a, b) => b.shows - a.shows || a.label.localeCompare(b.label));
}

/** Searchable venues-by-city list floating over the map. */
function VenuePanel({ venues, selected, onCity, onVenue, onAll }: {
  venues: VenueMapItem[];
  selected: VenueMapItem | null;
  onCity: (g: CityGroup) => void;
  onVenue: (v: VenueMapItem) => void;
  onAll: () => void;
}) {
  const [q, setQ] = useState("");
  const [openCity, setOpenCity] = useState<string | null>(null);
  // Open on desktop, a small button on phones so the map stays visible.
  const [open, setOpen] = useState(() => window.matchMedia("(min-width: 640px)").matches);

  const query = q.trim().toLowerCase();
  const groups = useMemo(() => {
    const all = groupByCity(venues);
    if (!query) return all;
    return all
      .map((g) => g.label.toLowerCase().includes(query)
        ? g
        : { ...g, venues: g.venues.filter((v) => v.name.toLowerCase().includes(query)) })
      .filter((g) => g.venues.length > 0);
  }, [venues, query]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="pointer-events-auto absolute left-4 top-4 flex h-11 items-center gap-2 rounded-full border border-white/10 bg-bg/85 px-4 text-[15px] font-semibold shadow-xl backdrop-blur-md">
        Venues <span className="text-text-subtle">{venues.length}</span>
      </button>
    );
  }

  return (
    <div className="absolute inset-x-3 top-16 flex max-h-[60%] flex-col overflow-hidden rounded-2xl border border-white/10 bg-bg/90 shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:bottom-6 sm:left-6 sm:top-6 sm:max-h-none sm:w-80">
      <div className="space-y-3 border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-xl leading-none">Venues <span className="font-body text-sm font-medium text-text-subtle">{venues.length}</span></p>
          <div className="flex items-center gap-1">
            <button onClick={() => { onAll(); setOpenCity(null); }} className="link-action px-2">All</button>
            <button onClick={() => setOpen(false)} aria-label="Hide venues"
              className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-surface-2">
              <Chevron dir="down" className="rotate-180" />
            </button>
          </div>
        </div>
        <SearchField value={q} onChange={setQ} placeholder="Search venues or cities" />
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {groups.length === 0 && <p className="p-4 text-sm text-text-subtle">No venues match.</p>}
        {groups.map((g) => {
          const expanded = query.length > 0 || openCity === g.key;
          return (
            <div key={g.key} className="border-b border-border last:border-b-0">
              <button
                onClick={() => { setOpenCity(expanded && !query ? null : g.key); onCity(g); }}
                className="flex min-h-[52px] w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-2/70"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{g.label}</span>
                  <span className="block text-xs text-text-subtle">
                    {g.venues.length} venue{g.venues.length === 1 ? "" : "s"} · {g.shows} show{g.shows === 1 ? "" : "s"}
                  </span>
                </span>
                <Chevron dir={expanded ? "down" : "right"} className="text-text-subtle" />
              </button>
              {expanded && (
                <div className="pb-1">
                  {g.venues.map((v) => (
                    <button key={v.id} onClick={() => onVenue(v)}
                      className={`flex min-h-[44px] w-full items-center justify-between gap-3 py-2 pl-6 pr-3 text-left transition-colors hover:bg-surface-2/70 ${selected?.id === v.id ? "bg-rose-950/30" : ""}`}>
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${selected?.id === v.id ? "bg-accent-pink" : "bg-accent-pink/50"}`} />
                        <span className="truncate text-sm">{v.name}</span>
                      </span>
                      <span className="shrink-0 text-xs text-text-subtle">{v.showCount}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Calculate bounds to fit all venues
function getBounds(venues: VenueMapItem[]): { center: { lat: number; lng: number }; zoom: number } {
  if (venues.length === 0) {
    return { center: { lat: 39.8283, lng: -98.5795 }, zoom: 4 }; // Center of US
  }
  if (venues.length === 1) {
    const v = venues[0]!;
    return { center: { lat: v.lat, lng: v.lng }, zoom: 12 };
  }

  const lats = venues.map((v) => v.lat);
  const lngs = venues.map((v) => v.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const center = {
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2,
  };

  // Rough zoom calculation based on bounds
  const latDiff = maxLat - minLat;
  const lngDiff = maxLng - minLng;
  const maxDiff = Math.max(latDiff, lngDiff);

  let zoom = 12;
  if (maxDiff > 100) zoom = 2;
  else if (maxDiff > 50) zoom = 3;
  else if (maxDiff > 20) zoom = 4;
  else if (maxDiff > 10) zoom = 5;
  else if (maxDiff > 5) zoom = 6;
  else if (maxDiff > 2) zoom = 7;
  else if (maxDiff > 1) zoom = 8;
  else if (maxDiff > 0.5) zoom = 9;
  else if (maxDiff > 0.2) zoom = 10;
  else if (maxDiff > 0.1) zoom = 11;

  return { center, zoom };
}

export function MapPage() {
  const venuesQuery = useQuery({
    queryKey: ["venues/map"],
    queryFn: () => api.listVenuesForMap(),
    staleTime: 60_000,
  });

  const venues = venuesQuery.data?.venues ?? [];
  const { center, zoom } = getBounds(venues);
  const [selected, setSelected] = useState<VenueMapItem | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const focusOn = (vs: VenueMapItem[]) => setFocus((f) => ({ venues: vs, seq: (f?.seq ?? 0) + 1 }));

  // No API key fallback
  if (!API_KEY) {
    return (
      <div>
        <PageHeader title="Map" />
        <div className="card p-8 text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="mx-auto mb-4 text-accent-pink">
            <path
              d="M12 2C8.134 2 5 5.134 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.866-3.134-7-7-7z"
              fill="currentColor"
            />
            <circle cx="12" cy="9" r="2.5" fill="white" />
          </svg>
          <p className="text-text-muted text-sm mb-2">
            Map requires Google Maps API key
          </p>
          <p className="text-text-subtle text-sm">
            Set <code className="bg-surface-2 px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code> in your environment
          </p>
        </div>
      </div>
    );
  }

  if (venuesQuery.isLoading) return <Loading label="Loading map…" />;
  if (venuesQuery.isError) return <EmptyState tone="error" title="Couldn't load venues." />;
  if (venues.length === 0) {
    return (
      <div>
        <PageHeader title="Map" />
        <EmptyState title="No venues with a location yet." body="Add coordinates to a venue to see it on the map." />
      </div>
    );
  }

  // The map fills the screen edge to edge below the app bar, running under the
  // floating tab bar on phones, breaking out of the page column and padding.
  return (
    <div className="relative -mt-6 ml-[calc(50%-50vw)] w-screen -mb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:-mb-8 sm:-mt-8">
      <div className="relative h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] min-h-[360px] sm:h-[calc(100dvh-4rem-env(safe-area-inset-top))]">
        {/* Venues tab: back to the list */}
        <div className="absolute right-4 top-4 z-20"><VenueViewSwitch view="map" floating /></div>
        <APIProvider apiKey={API_KEY}>
          <Map
            defaultCenter={center}
            defaultZoom={zoom}
            styles={DARK_STYLES}
            disableDefaultUI={false}
            zoomControl={true}
            // Mid-right, clear of the floating tab bar on phones.
            zoomControlOptions={{ position: ControlPosition.RIGHT_CENTER }}
            cameraControl={false}
            mapTypeControl={false}
            streetViewControl={false}
            fullscreenControl={false}
            gestureHandling="greedy"
            clickableIcons={false}
          >
            <MapContent venues={venues} selected={selected}
              onSelect={(v) => { setSelected(v); if (v) focusOn([v]); }} />
            <FocusController focus={focus} />
          </Map>
        </APIProvider>

        <h1 className="sr-only">Map</h1>
        <VenuePanel
          venues={venues}
          selected={selected}
          onCity={(g) => { setSelected(null); focusOn(g.venues); }}
          onVenue={(v) => { setSelected(v); focusOn([v]); }}
          onAll={() => { setSelected(null); focusOn(venues); }}
        />
      </div>
    </div>
  );
}
