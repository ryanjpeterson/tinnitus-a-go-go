/**
 * VenueMap — embeds a Google Maps tile with a custom-branded dark style and an
 * accent-pink pin at the given lat/lng.
 *
 * When VITE_GOOGLE_MAPS_API_KEY is not set, renders a compact OSM fallback link
 * so the page still works without configuration.
 *
 * Sizing:
 *   default  — 320px tall  (venue detail page, full map)
 *   compact  — 160px tall  (concert detail page, inline snippet)
 */

import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import { mapStyles, markerIcon } from "@/lib/theme";
import { useBrand } from "@/lib/useBrand";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? "";

/**
 * Dark map style — matches the app palette:
 *   bg          #141416 (dark background)
 *   accents     #A8FF3E (lime green for roads, labels)
 *   water       dark with subtle green tint
 *   minimal     hide most POIs, keep it clean
 *
 * google.maps.MapTypeStyle is loaded lazily by the Google Maps JS SDK; we
 * assert the type as `object[]` here to avoid a hard @types/google.maps dep.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any



// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface VenueMapProps {
  lat: number;
  lng: number;
  venueName: string;
  /** compact = small inline snippet (concert page); default = full map (venue page) */
  compact?: boolean;
}

export function VenueMap({ lat, lng, venueName, compact = false }: VenueMapProps) {
  const { theme: brandTheme } = useBrand();
  const position = { lat, lng };
  const osmUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;

  // ── No API key: render a simple OSM link fallback ──────────────────────────
  if (!API_KEY) {
    return (
      <div className="rounded-lg border border-border bg-surface-2 flex items-center justify-center px-4 py-6 gap-3">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-accent-pink shrink-0">
          <path
            d="M12 2C8.134 2 5 5.134 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.866-3.134-7-7-7z"
            fill="currentColor"
          />
          <circle cx="12" cy="9" r="2.5" fill="white" />
        </svg>
        <div>
          <p className="text-xs text-text-muted">{venueName}</p>
          <a
            href={osmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="link-action"
          >
            View on OpenStreetMap ↗
          </a>
        </div>
      </div>
    );
  }

  // ── Google Maps ────────────────────────────────────────────────────────────
  return (
    <APIProvider apiKey={API_KEY}>
      <div
        className="rounded-lg overflow-hidden border border-border"
        style={{ height: compact ? 160 : 320 }}
      >
        <Map
          defaultCenter={position}
          defaultZoom={16}
          styles={mapStyles(brandTheme)}
          disableDefaultUI={true}
          gestureHandling={compact ? "none" : "cooperative"}
          clickableIcons={false}
        >
          <Marker position={position} title={venueName} icon={markerIcon(brandTheme)} />
        </Map>
      </div>
    </APIProvider>
  );
}
