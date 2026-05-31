/**
 * MapPage — full-screen map showing all venues with coordinates.
 *
 * Uses the same dark Google Maps styling as VenueMap, with clustered markers
 * when zoomed out and individual venue pins when zoomed in.
 */

import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { APIProvider, Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { api, type VenueMapItem } from "@/lib/api";

const API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? "";

// Dark map style — matches the app palette
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

// Custom pin component
function VenuePin({ selected }: { selected?: boolean }) {
  return (
    <div
      style={{
        width: selected ? 28 : 22,
        height: selected ? 28 : 22,
        borderRadius: "50%",
        backgroundColor: "#FF3D6E",
        border: `${selected ? 4 : 3}px solid #A8FF3E`,
        boxShadow: selected
          ? "0 0 20px rgba(168,255,62,0.8), 0 0 12px rgba(255,61,110,0.7), 0 2px 6px rgba(0,0,0,0.8)"
          : "0 0 12px rgba(255,61,110,0.7), 0 2px 6px rgba(0,0,0,0.8)",
        transition: "all 0.15s ease-out",
        cursor: "pointer",
      }}
    />
  );
}

// Venue info popup
function VenuePopup({ venue, onClose }: { venue: VenueMapItem; onClose: () => void }) {
  return (
    <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-10">
      <div className="rounded-lg border border-border bg-surface p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Link
              to={`/venues/${venue.slug}`}
              className="font-display uppercase text-lg hover:text-accent-lime transition-colors block truncate"
            >
              {venue.name}
            </Link>
            {(venue.city || venue.region) && (
              <p className="text-sm text-text-muted mt-0.5">
                {[venue.city, venue.region].filter(Boolean).join(", ")}
              </p>
            )}
            <p className="text-xs font-mono text-text-subtle mt-2">
              {venue.showCount} {venue.showCount === 1 ? "show" : "shows"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-subtle hover:text-text-base transition-colors p-1 -mr-1 -mt-1"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        <Link
          to={`/venues/${venue.slug}`}
          className="mt-3 block text-center text-xs font-mono px-3 py-2 rounded border border-accent-lime text-accent-lime hover:bg-accent-lime/10 transition-colors"
        >
          View venue →
        </Link>
      </div>
    </div>
  );
}

// Map content with markers
function MapContent({ venues }: { venues: VenueMapItem[] }) {
  const map = useMap();
  const [selectedVenue, setSelectedVenue] = useState<VenueMapItem | null>(null);

  const handleMarkerClick = useCallback((venue: VenueMapItem) => {
    setSelectedVenue(venue);
    if (map) {
      map.panTo({ lat: venue.lat, lng: venue.lng });
    }
  }, [map]);

  return (
    <>
      {venues.map((venue) => (
        <AdvancedMarker
          key={venue.id}
          position={{ lat: venue.lat, lng: venue.lng }}
          title={venue.name}
          onClick={() => handleMarkerClick(venue)}
        >
          <VenuePin selected={selectedVenue?.id === venue.id} />
        </AdvancedMarker>
      ))}
      {selectedVenue && (
        <VenuePopup venue={selectedVenue} onClose={() => setSelectedVenue(null)} />
      )}
    </>
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

  // No API key fallback
  if (!API_KEY) {
    return (
      <div>
        <h1 className="font-display uppercase text-3xl mb-6">Map</h1>
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="mx-auto mb-4 text-accent-pink">
            <path
              d="M12 2C8.134 2 5 5.134 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.866-3.134-7-7-7z"
              fill="currentColor"
            />
            <circle cx="12" cy="9" r="2.5" fill="white" />
          </svg>
          <p className="text-text-muted font-mono text-sm mb-2">
            Map requires Google Maps API key
          </p>
          <p className="text-text-subtle text-xs">
            Set <code className="bg-surface-2 px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code> in your environment
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display uppercase text-3xl">Map</h1>
        {venues.length > 0 && (
          <span className="font-mono text-sm text-text-muted">
            {venues.length} {venues.length === 1 ? "venue" : "venues"}
          </span>
        )}
      </div>

      {venuesQuery.isLoading ? (
        <div className="rounded-lg border border-border bg-surface-2 h-[calc(100vh-220px)] min-h-[400px] flex items-center justify-center">
          <p className="text-text-subtle font-mono text-sm animate-pulse">Loading map…</p>
        </div>
      ) : venuesQuery.isError ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-accent-pink font-mono text-sm">Failed to load venues</p>
        </div>
      ) : venues.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-text-muted font-mono text-sm">No venues with coordinates yet</p>
          <p className="text-text-subtle text-xs mt-2">
            Add lat/lng to your venues to see them on the map
          </p>
        </div>
      ) : (
        <APIProvider apiKey={API_KEY}>
          <div className="rounded-lg overflow-hidden border border-border h-[calc(100vh-220px)] min-h-[400px] relative">
            <Map
              defaultCenter={center}
              defaultZoom={zoom}
              mapId="DEMO_MAP_ID"
              styles={DARK_STYLES}
              disableDefaultUI={false}
              zoomControl={true}
              mapTypeControl={false}
              streetViewControl={false}
              fullscreenControl={true}
              gestureHandling="greedy"
              clickableIcons={false}
            >
              <MapContent venues={venues} />
            </Map>
          </div>
        </APIProvider>
      )}

      {venues.length > 0 && (
        <p className="mt-3 text-xs text-text-subtle font-mono">
          Click a pin to see venue details
        </p>
      )}
    </div>
  );
}
