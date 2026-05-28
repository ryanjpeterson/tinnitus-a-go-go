/**
 * EntityCard — shared card component used by Artists, Venues, and Festivals index pages.
 *
 * Renders a linked card with an image (or initial-based placeholder), a primary
 * name, one optional sub-line, and one optional detail line.
 */

import { Link } from "react-router-dom";
import { clsx } from "clsx";

interface EntityCardProps {
  href: string;
  name: string;
  /** Direct image URL — shows a photo when available. */
  imageUrl?: string | null;
  /** First sub-line: genre, city/region, year, etc. */
  sub1?: string | null;
  /** Second sub-line: show count, days · artists, etc. */
  sub2?: string | null;
  /** Image crop ratio. Venues use "video" (16 : 9); everything else "square". */
  imageAspect?: "square" | "video";
  /** Tailwind bg-* class for the placeholder background. */
  placeholderBg?: string;
  /** Tailwind text-* class for the initials colour inside the placeholder. */
  placeholderColor?: string;
}

function Placeholder({
  name,
  bg,
  color,
}: {
  name: string;
  bg: string;
  color: string;
}) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className={`w-full h-full ${bg} flex items-center justify-center`}>
      <span className={`font-display uppercase text-3xl ${color} opacity-30 tracking-widest select-none`}>
        {initials}
      </span>
    </div>
  );
}

export function EntityCard({
  href,
  name,
  imageUrl,
  sub1,
  sub2,
  imageAspect = "square",
  placeholderBg = "bg-surface-2",
  placeholderColor = "text-text-subtle",
}: EntityCardProps) {
  return (
    <Link
      to={href}
      className="group flex flex-col rounded-lg border border-border bg-surface overflow-hidden hover:border-accent-lime transition-colors"
    >
      {/* Image / placeholder */}
      <div
        className={clsx(
          "overflow-hidden",
          imageAspect === "video" ? "aspect-video" : "aspect-square",
        )}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <Placeholder name={name} bg={placeholderBg} color={placeholderColor} />
        )}
      </div>

      {/* Card body */}
      <div className="p-3 flex flex-col gap-0.5">
        <div className="text-sm font-display uppercase tracking-wide text-text-base truncate">
          {name}
        </div>
        {sub1 && (
          <div className="text-xs text-text-muted truncate">{sub1}</div>
        )}
        {sub2 && (
          <div className="text-xs font-mono text-text-subtle mt-1">{sub2}</div>
        )}
      </div>
    </Link>
  );
}
