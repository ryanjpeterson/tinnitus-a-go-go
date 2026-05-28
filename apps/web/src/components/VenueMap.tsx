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

import { APIProvider, Map, AdvancedMarker } from "@vis.gl/react-google-maps";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? "";

/**
 * Dark map style — matches the app palette:
 *   bg          #141416 (new lighter bg token)
 *   roads       surface / surface-2 shades
 *   water       deep navy
 *   text labels muted grey
 *
 * google.maps.MapTypeStyle is loaded lazily by the Google Maps JS SDK; we
 * assert the type as `object[]` here to avoid a hard @types/google.maps dep.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DARK_STYLES: any[] = [
  { elementType: "geometry",              stylers: [{ color: "#141416" }] },
  { elementType: "labels.text.fill",      stylers: [{ color: "#9C9A93" }] },
  { elementType: "labels.text.stroke",    stylers: [{ color: "#0e0e10" }] },
  { featureType: "administrative",        elementType: "geometry",           stylers: [{ color: "#303034" }] },
  { featureType: "administrative.country",elementType: "labels.text.fill",   stylers: [{ color: "#9C9A93" }] },
  { featureType: "landscape",             elementType: "geometry",           stylers: [{ color: "#141416" }] },
  { featureType: "poi",                   elementType: "geometry",           stylers: [{ color: "#1C1C1F" }] },
  { featureType: "poi",                   elementType: "labels.text.fill",   stylers: [{ color: "#6B6963" }] },
  { featureType: "poi.park",              elementType: "geometry.fill",      stylers: [{ color: "#1a2a1a" }] },
  { featureType: "road",                  elementType: "geometry",           stylers: [{ color: "#252528" }] },
  { featureType: "road",                  elementType: "labels.text.fill",   stylers: [{ color: "#6B6963" }] },
  { featureType: "road.arterial",         elementType: "geometry",           stylers: [{ color: "#2E2E32" }] },
  { featureType: "road.highway",          elementType: "geometry",           stylers: [{ color: "#353538" }] },
  { featureType: "road.highway",          elementType: "geometry.stroke",    stylers: [{ color: "#141416" }] },
  { featureType: "transit",               elementType: "geometry",           stylers: [{ color: "#1C1C1F" }] },
  { featureType: "transit.station",       elementType: "labels.text.fill",   stylers: [{ color: "#6B6963" }] },
  { featureType: "water",                 elementType: "geometry.fill",      stylers: [{ color: "#0d1f2d" }] },
  { featureType: "water",                 elementType: "labels.text.fill",   stylers: [{ color: "#3d6175" }] },
];

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
          <p className="text-xs text-text-muted font-mono">{venueName}</p>
          <a
            href={osmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors"
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
          // mapId required for AdvancedMarker; DEMO_MAP_ID is Google's sandbox
          mapId="DEMO_MAP_ID"
          styles={DARK_STYLES}
          disableDefaultUI={true}
          gestureHandling={compact ? "none" : "cooperative"}
          clickableIcons={false}
        >
          <AdvancedMarker position={position} title={venueName}>
            {/* Custom branded pin: pink disc with lime ring */}
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                backgroundColor: "#FF3D6E",
                border: "3px solid #A8FF3E",
                boxShadow: "0 0 12px rgba(255,61,110,0.7), 0 2px 6px rgba(0,0,0,0.8)",
              }}
            />
          </AdvancedMarker>
        </Map>
      </div>
    </APIProvider>
  );
}
