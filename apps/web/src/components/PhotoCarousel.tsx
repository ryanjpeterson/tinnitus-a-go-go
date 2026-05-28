/**
 * PhotoCarousel — full-screen Swiper lightbox, shared across the app.
 *
 * Usage:
 *   <PhotoCarousel items={[...]} initialIndex={2} onClose={() => setOpen(false)} />
 *
 * Supports:
 *   - Touch swipe (Swiper core)
 *   - Mouse drag
 *   - Keyboard ← → navigation (Swiper Keyboard module)
 *   - Escape to close (useEffect)
 *   - Video slides (autoplay, controls)
 *   - Optional per-slide captions
 */

import { useEffect, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Keyboard } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CarouselItem {
  id: string;
  /** Primary display URL (medium or large recommended). */
  src: string;
  /** High-res variant — shown instead of src when available. */
  srcLarge?: string | null;
  /** Poster frame for video slides. */
  poster?: string | null;
  isVideo?: boolean;
  /** Optional content rendered below the media. */
  caption?: React.ReactNode;
}

interface PhotoCarouselProps {
  items: CarouselItem[];
  initialIndex?: number;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PhotoCarousel({ items, initialIndex = 0, onClose }: PhotoCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  // Escape key — Swiper Keyboard handles ← → internally
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/92 flex flex-col select-none">
      {/* Header bar: counter left, close right */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <span className="text-xs font-mono text-white/40">
          {items.length > 1 ? `${activeIndex + 1} / ${items.length}` : ""}
        </span>
        <button
          className="text-white/70 hover:text-white text-2xl font-mono w-10 h-10 flex items-center justify-center"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Swiper — fills remaining height */}
      <div className="flex-1 min-h-0">
        <Swiper
          modules={[Navigation, Keyboard]}
          navigation
          keyboard={{ enabled: true }}
          initialSlide={initialIndex}
          slidesPerView={1}
          spaceBetween={24}
          onSlideChange={(s) => setActiveIndex(s.activeIndex)}
          className="h-full"
          style={
            {
              "--swiper-navigation-color": "rgba(255,255,255,0.7)",
              "--swiper-navigation-size": "24px",
            } as React.CSSProperties
          }
        >
          {items.map((item) => (
            <SwiperSlide
              key={item.id}
              style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <div className="flex flex-col items-center gap-3 w-full px-10 pb-6">
                {item.isVideo ? (
                  <video
                    key={item.id}
                    src={item.src}
                    poster={item.poster ?? undefined}
                    controls
                    autoPlay
                    className="max-h-[75vh] max-w-full rounded"
                  />
                ) : (
                  <img
                    src={item.srcLarge ?? item.src}
                    alt=""
                    className="max-h-[75vh] max-w-full object-contain rounded"
                    loading="lazy"
                  />
                )}
                {item.caption && (
                  <div className="text-white/60 text-xs font-mono text-center max-w-md">
                    {item.caption}
                  </div>
                )}
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </div>
  );
}
