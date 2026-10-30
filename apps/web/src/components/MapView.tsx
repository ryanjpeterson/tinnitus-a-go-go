/**
 * MapView — places on a map in the theme's colours. Every app that shows a
 * map uses this, so maps look the same everywhere: the page colour for land,
 * roads tinted with the accent, POIs and transit hidden, pins as flat
 * highlight circles (`markerIcon`), the selected one bigger.
 *
 * With a Google Maps key (VITE_GOOGLE_MAPS_API_KEY) it's a real map styled by
 * `mapStyles(theme)`; without one it draws a themed preview with the same
 * pins, so the page still works and still looks like the app.
 *
 * jimbo-ui reference: needs `@vis.gl/react-google-maps`. Pair it with
 * `MapPinCard` for the selected place, and `ViewSwitch` for list ⇄ map.
 */

import { type ReactNode } from "react";
import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import { cn } from "@/lib/cn";
import { mapStyles, markerIcon, type Theme } from "@/lib/theme";
import { useBrand } from "@/lib/useBrand";

export type MapPin = { id: string; lat: number; lng: number; label: string };

const HEIGHT = { compact: 160, full: 320, fill: "100%" } as const;
const KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? "";

/** Centre and a zoom that fits every pin. */
function frame(pins: MapPin[]) {
  if (pins.length === 0) return { center: { lat: 0, lng: 0 }, zoom: 2 };
  const lats = pins.map((p) => p.lat), lngs = pins.map((p) => p.lng);
  const span = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs), 0.002);
  return {
    center: { lat: (Math.max(...lats) + Math.min(...lats)) / 2, lng: (Math.max(...lngs) + Math.min(...lngs)) / 2 },
    zoom: Math.max(2, Math.min(16, Math.round(Math.log2(360 / span)) - 1)),
  };
}

export function MapView({ pins, selected, onSelect, size = "full", apiKey = KEY, theme: override, className }: {
  pins: MapPin[];
  selected?: string | null;
  onSelect?: (pin: MapPin) => void;
  /** compact: an inline snippet (160 px, no gestures) · full: a section (320 px) · fill: the whole parent (a map page). */
  size?: keyof typeof HEIGHT;
  apiKey?: string;
  /** Only to draw it in a theme other than the app's (inside ThemeScope). */
  theme?: Theme;
  className?: string;
}) {
  const brand = useBrand();
  const theme = override ?? brand.theme;
  const { center, zoom } = frame(pins);
  const box = cn("relative overflow-hidden rounded-xl border border-border bg-bg", size === "fill" && "rounded-none border-0", className);

  if (!apiKey) return <MapPreview theme={theme} pins={pins} selected={selected} onSelect={onSelect} className={box} height={HEIGHT[size]} />;

  return (
    <APIProvider apiKey={apiKey}>
      <div className={box} style={{ height: HEIGHT[size] }}>
        <Map defaultCenter={center} defaultZoom={zoom} styles={mapStyles(theme)} disableDefaultUI clickableIcons={false}
          gestureHandling={size === "compact" ? "none" : size === "fill" ? "greedy" : "cooperative"}>
          {pins.map((p) => (
            <Marker key={p.id} position={p} title={p.label} icon={markerIcon(theme, p.id === selected)}
              zIndex={p.id === selected ? 10 : 1} onClick={() => onSelect?.(p)} />
          ))}
        </Map>
      </div>
    </APIProvider>
  );
}

/** The keyless stand-in: tinted roads and water on the page colour, the same pins. */
function MapPreview({ theme, pins, selected, onSelect, className, height }: {
  theme: Theme; pins: MapPin[]; selected?: string | null; onSelect?: (pin: MapPin) => void; className: string; height: number | string;
}) {
  const lats = pins.map((p) => p.lat), lngs = pins.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const x = (lng: number) => 12 + (maxLng === minLng ? 0.5 : (lng - minLng) / (maxLng - minLng)) * 76;
  const y = (lat: number) => 14 + (maxLat === minLat ? 0.5 : 1 - (lat - minLat) / (maxLat - minLat)) * 72;
  return (
    <div className={className} style={{ height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <path d="M-5 78 C 20 70, 30 92, 55 84 S 90 70, 105 76 L105 105 L-5 105 Z" className="fill-accent/10" />
        {[18, 41, 63].map((v) => <line key={`h${v}`} x1="-5" x2="105" y1={v} y2={v + 6} className="stroke-accent/25" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        {[22, 47, 74].map((v) => <line key={`v${v}`} y1="-5" y2="105" x1={v} x2={v - 5} className="stroke-accent/25" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        <path d="M-5 30 Q 40 22, 105 48" fill="none" className="stroke-accent/35" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>
      {pins.map((p) => {
        const on = p.id === selected;
        return (
          <button key={p.id} type="button" title={p.label} aria-label={p.label} onClick={() => onSelect?.(p)}
            className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            style={{ left: `${x(p.lng)}%`, top: `${y(p.lat)}%`, zIndex: on ? 2 : 1 }}>
            <img src={markerIcon(theme, on)} alt="" />
          </button>
        );
      })}
    </div>
  );
}

/**
 * The selected place, floating over a map page above the dock: name, a line,
 * then whatever the app lists there (its items, a button to open it).
 */
export function MapPinCard({ title, sub, onClose, children }: { title: string; sub?: ReactNode; onClose: () => void; children?: ReactNode }) {
  return (
    <div className="absolute inset-x-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-10 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-80">
      <div className="card p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xl">{title}</p>
            {sub && <p className="meta mt-0.5">{sub}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-control text-text-subtle hover:text-text-base">✕</button>
        </div>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  );
}
