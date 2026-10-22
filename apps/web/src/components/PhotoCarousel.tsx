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
 *   - Escape, the × button, tapping around the photo, or swiping down to close
 *   - Safe-area padding so the close button clears the iPhone status bar
 *   - Video slides (autoplay, controls)
 *   - Optional per-slide captions
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

/**
 * Keep the page behind still. iOS Safari ignores `overflow: hidden` on <body>
 * for touch scrolling, so the body is pinned in place and restored on close.
 */
function useScrollLock(): void {
  useEffect(() => {
    const y = window.scrollY;
    const { style } = document.body;
    const prev = { position: style.position, top: style.top, width: style.width, overflow: style.overflow };
    style.position = "fixed";
    style.top = `-${y}px`;
    style.width = "100%";
    style.overflow = "hidden";
    return () => {
      Object.assign(style, prev);
      window.scrollTo(0, y);
    };
  }, []);
}

export function PhotoCarousel({ items, initialIndex = 0, onClose }: PhotoCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  // Swipe down to close: how far the photo has been dragged (px).
  const [dragY, setDragY] = useState(0);
  // The gesture in progress; `dy` lives here too, since state can lag a quick flick.
  const drag = useRef<{ x: number; y: number; dy: number; vertical: boolean | null } | null>(null);

  useScrollLock();

  // Escape key — Swiper Keyboard handles ← → internally
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    drag.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY, dy: 0, vertical: null };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.touches[0]!.clientX - d.x;
    const dy = e.touches[0]!.clientY - d.y;
    // Decide once per gesture: sideways belongs to Swiper, downwards to closing.
    if (d.vertical === null && Math.abs(dx) + Math.abs(dy) > 10) d.vertical = Math.abs(dy) > Math.abs(dx);
    if (d.vertical) {
      d.dy = Math.max(0, dy);
      setDragY(d.dy);
    }
  };
  const onTouchEnd = () => {
    const closing = !!drag.current?.vertical && drag.current.dy > 110;
    drag.current = null;
    if (closing) onClose();
    else setDragY(0);
  };

  const fade = Math.max(0.35, 1 - dragY / 400);

  return createPortal(
    <div
      data-no-swipe
      role="dialog"
      aria-modal="true"
      aria-label="Photos"
      className="fixed inset-0 z-[200] flex h-[100dvh] select-none flex-col overscroll-none bg-black pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]"
      style={{ backgroundColor: `rgba(0,0,0,${fade})` }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {/* Header bar: counter left, close right — clear of the notch / status bar */}
      <div className="flex shrink-0 items-center justify-between px-3 py-2" style={{ opacity: fade }}>
        <span className="pl-1 text-sm font-medium text-white/60">
          {items.length > 1 ? `${activeIndex + 1} / ${items.length}` : ""}
        </span>
        <button
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white active:scale-95"
          onClick={onClose}
          aria-label="Close"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {/* Swiper — fills remaining height; tapping around the photo closes */}
      <div className="min-h-0 flex-1" style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragY ? "none" : "transform 200ms ease" }}>
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
          {items.map((item, i) => (
            <SwiperSlide
              key={item.id}
              style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            >
              <div
                className="flex w-full flex-col items-center gap-3 px-3 pb-4 sm:px-12"
                onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
              >
                {item.isVideo ? (
                  <video
                    key={item.id}
                    src={item.src}
                    poster={item.poster ?? undefined}
                    controls
                    playsInline
                    autoPlay={i === activeIndex}
                    className="max-h-[calc(100dvh-9rem)] max-w-full rounded-lg"
                  />
                ) : (
                  <img
                    src={item.srcLarge ?? item.src}
                    alt=""
                    draggable={false}
                    // Safari can leave lazy images in off-screen slides blank — load neighbours eagerly.
                    loading={Math.abs(i - activeIndex) <= 1 ? "eager" : "lazy"}
                    className="max-h-[calc(100dvh-9rem)] max-w-full rounded-lg object-contain"
                  />
                )}
                {item.caption && (
                  <div className="max-w-md text-center text-xs text-white/60">
                    {item.caption}
                  </div>
                )}
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </div>,
    document.body
  );
}
