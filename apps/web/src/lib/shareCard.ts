/**
 * Story-sized share images (1080×1920), drawn on the device: the flyer over a
 * blurred copy of itself, in the brand theme's colours, then the title, date, venue and a few stats. Shared
 * through the system share sheet where supported, downloaded otherwise.
 */

import { DEFAULT_THEME, THEME_STORAGE_KEY, themeHex, type Theme } from "./theme";

export interface ShareCard {
  imageUrl?: string | null;
  eyebrow: string;
  title: string;
  lines: string[];
  stats?: { label: string; value: string }[];
  /** File name without extension. */
  fileName: string;
}

const W = 1080;
const H = 1920;
/** The current brand colours (applyTheme caches them), or the defaults. */
function colors(): { accent: string; highlight: string; bg: string; text: string; tint: string } {
  let theme: Theme = DEFAULT_THEME;
  try { theme = { ...DEFAULT_THEME, ...(JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) ?? "{}") as Partial<Theme>) }; } catch { /* defaults */ }
  const hex = themeHex(theme);
  return { accent: theme.accent, highlight: theme.highlight, bg: theme.background, text: hex.text!, tint: hex["accent-900"]! };
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // keeps the canvas exportable when media comes from another origin
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Word-wrap `text` to at most `maxLines` lines of `width`, ellipsising the last. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= width || !cur) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1]!;
    while (ctx.measureText(`${last}…`).width > width && last.length > 1) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function draw(card: ShareCard): Promise<Blob> {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const img = card.imageUrl ? await loadImage(card.imageUrl) : null;

  // Background: blurred, darkened flyer — or the app's dark gradient.
  const c = colors();
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);
  if (img) {
    const s = Math.max(W / img.width, H / img.height) * 1.1;
    ctx.filter = "blur(48px) brightness(0.45) saturate(1.3)";
    ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
    ctx.filter = "none";
  } else {
    const g = ctx.createRadialGradient(W * 0.3, H * 0.2, 50, W * 0.5, H * 0.5, H);
    g.addColorStop(0, c.tint);
    g.addColorStop(1, c.bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const fade = ctx.createLinearGradient(0, H * 0.45, 0, H);
  fade.addColorStop(0, `${c.bg}00`);
  fade.addColorStop(1, `${c.bg}EB`);
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, H);

  // The flyer itself, framed.
  let y = 150;
  if (img) {
    const boxW = 760, boxH = 900;
    const s = Math.min(boxW / img.width, boxH / img.height);
    const w = img.width * s, h = img.height * s;
    const x = (W - w) / 2;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 20;
    roundRect(ctx, x, y, w, h, 28);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, x, y, w, h, 28);
    ctx.clip();
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
    y += h + 90;
  } else {
    y = 620;
  }

  const left = 90, width = W - 180;
  ctx.textBaseline = "top";
  ctx.fillStyle = c.highlight;
  ctx.font = "700 36px Inter, system-ui, sans-serif";
  ctx.fillText(card.eyebrow.toUpperCase(), left, y);
  y += 64;

  ctx.fillStyle = c.text;
  ctx.font = "800 92px Archivo, system-ui, sans-serif";
  for (const line of wrap(ctx, card.title, width, 3)) {
    ctx.fillText(line, left, y);
    y += 100;
  }
  y += 16;
  ctx.fillStyle = c.text + "BF";
  ctx.font = "500 40px Inter, system-ui, sans-serif";
  for (const l of card.lines.slice(0, 3)) {
    for (const line of wrap(ctx, l, width, 2)) { ctx.fillText(line, left, y); y += 54; }
  }

  if (card.stats && card.stats.length > 0) {
    y += 40;
    const cols = Math.min(card.stats.length, 3);
    const colW = width / cols;
    card.stats.slice(0, 3).forEach((st, i) => {
      const x = left + i * colW;
      ctx.fillStyle = c.accent;
      ctx.font = "800 84px Archivo, system-ui, sans-serif";
      ctx.fillText(st.value, x, y);
      ctx.fillStyle = c.text + "99";
      ctx.font = "700 28px Inter, system-ui, sans-serif";
      ctx.fillText(st.label.toUpperCase(), x, y + 98);
    });
  }

  // Footer mark
  ctx.fillStyle = c.accent;
  ctx.font = "800 40px Archivo, system-ui, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Tinnitus A Go Go", left, H - 110);

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the image."))), "image/png");
    } catch (err) {
      reject(err);
    }
  });
}

/** Draw the card and share it (or download it). Retries without the image if it can't be exported. */
export async function shareCard(card: ShareCard): Promise<"shared" | "downloaded" | "cancelled"> {
  let blob: Blob;
  try {
    blob = await draw(card);
  } catch {
    blob = await draw({ ...card, imageUrl: null });
  }
  const file = new File([blob], `${card.fileName}.png`, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: card.title });
      return "shared";
    } catch (err) {
      if ((err as Error).name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded";
}
