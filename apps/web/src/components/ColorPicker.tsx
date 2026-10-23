/**
 * ColorPicker — an inline, touch-friendly colour picker (no native dialog):
 * a saturation/brightness field, a hue slider, quick swatches and a hex box.
 * Drag with a finger or mouse; the value updates as you go.
 *
 * Part of jimbo-ui (foundation — don't edit here; change jimbo-ui and update).
 */

import { useEffect, useRef, useState } from "react";
import { hexToRgb, isHex, rgbToHex } from "@/lib/theme";

type HSV = { h: number; s: number; v: number };

function hexToHsv(hex: string): HSV {
  const [r, g, b] = hexToRgb(hex).map((x) => x / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

function hsvToHex({ h, s, v }: HSV): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return rgbToHex([f(5) * 255, f(3) * 255, f(1) * 255]);
}

/** Pointer drag over an element, reporting 0–1 positions. */
function useDrag(onMove: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const handler = useRef(onMove);
  handler.current = onMove;
  const report = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    handler.current(
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    );
  };
  return {
    ref,
    onPointerDown: (e: React.PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); report(e); },
    onPointerMove: (e: React.PointerEvent) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) report(e); },
  };
}

export function ColorPicker({ value, onChange, swatches }: {
  value: string;
  onChange: (hex: string) => void;
  /** Quick picks shown under the picker. */
  swatches: string[];
}) {
  // Keep hue/saturation while dragging through black or grey (they'd be lost round-tripping through hex).
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value));
  const [text, setText] = useState(value);
  const last = useRef(value);
  useEffect(() => {
    if (value.toUpperCase() !== last.current.toUpperCase()) {
      setHsv(hexToHsv(value));
      setText(value);
      last.current = value;
    }
  }, [value]);

  const emit = (next: HSV) => {
    setHsv(next);
    const hex = hsvToHex(next);
    last.current = hex;
    setText(hex);
    onChange(hex);
  };

  const field = useDrag((x, y) => emit({ ...hsv, s: x, v: 1 - y }));
  const hue = useDrag((x) => emit({ ...hsv, h: x * 359.9 }));
  const pure = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <div className="space-y-4">
      {/* Saturation (→) and brightness (↑) for the current hue */}
      <div
        {...field}
        role="slider"
        aria-label="Saturation and brightness"
        aria-valuetext={value}
        className="relative h-44 w-full cursor-crosshair touch-none select-none rounded-2xl sm:h-52"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pure})` }}
      >
        <span
          className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_4px_12px_rgba(0,0,0,0.5)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: value }}
        />
      </div>

      {/* Hue */}
      <div
        {...hue}
        role="slider"
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        className="relative h-9 w-full cursor-pointer touch-none select-none rounded-full"
        style={{ background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
      >
        <span
          className="pointer-events-none absolute top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_4px_12px_rgba(0,0,0,0.5)]"
          style={{ left: `${(hsv.h / 360) * 100}%`, background: pure }}
        />
      </div>

      {/* Quick picks */}
      <div className="grid grid-cols-8 gap-1.5 sm:gap-2">
        {swatches.map((c) => (
          <button key={c} type="button" onClick={() => { setText(c); onChange(c); }} aria-label={`Use ${c}`}
            className={`aspect-square w-full max-w-10 justify-self-center rounded-full border-2 transition-transform active:scale-90 ${c.toUpperCase() === value.toUpperCase() ? "border-text-base" : "border-black/30"}`}
            style={{ background: c }} />
        ))}
      </div>

      {/* Hex */}
      <label className="flex items-center gap-3">
        <span className="h-10 w-10 shrink-0 rounded-xl border border-border" style={{ background: value }} />
        <span className="text-sm text-text-muted">Hex</span>
        <input
          value={text}
          onChange={(e) => {
            const raw = e.target.value.trim();
            setText(raw);
            const hex = raw.startsWith("#") ? raw : `#${raw}`;
            if (isHex(hex)) onChange(hex.toUpperCase());
          }}
          maxLength={7}
          spellCheck={false}
          aria-label="Hex colour"
          className={`field ml-auto h-10 w-32 font-mono text-sm uppercase ${isHex(text.startsWith("#") ? text : `#${text}`) ? "" : "border-accent-pink"}`}
        />
      </label>
    </div>
  );
}
