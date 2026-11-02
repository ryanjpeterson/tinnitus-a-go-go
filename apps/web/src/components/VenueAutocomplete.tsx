import { useRef, useState } from "react";
import { api, type VenueListItem } from "@/lib/api";

/** Venue name input that suggests existing venues as you type; picking one fills its city and region. */
export function VenueAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Venue name",
  inputClassName,
}: {
  value: string;
  onChange: (val: string) => void;
  onSelect: (name: string, city: string, region: string) => void;
  placeholder?: string;
  inputClassName?: string;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [results, setResults] = useState<VenueListItem[]>([]);
  const [showDrop, setShowDrop] = useState(false);

  const handleChange = (val: string) => {
    onChange(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!val.trim() || val.length < 2) {
      setResults([]);
      setShowDrop(false);
      return;
    }
    timerRef.current = setTimeout(() => {
      api.listVenues({ q: val, limit: 6 }).then((r) => {
        if (r.venues.length > 0) {
          setResults(r.venues);
          setShowDrop(true);
        } else {
          setResults([]);
          setShowDrop(false);
        }
      }).catch(() => {});
    }, 280);
  };

  const handlePick = (v: VenueListItem) => {
    onSelect(v.name, v.city ?? "", v.region ?? "");
    setResults([]);
    setShowDrop(false);
  };

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => results.length > 0 && setShowDrop(true)}
        onBlur={() => setTimeout(() => setShowDrop(false), 150)}
        placeholder={placeholder}
        className={inputClassName ?? "field h-11 w-full"}
      />
      {showDrop && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-40 mt-1 bg-surface border border-border rounded-lg shadow-xl py-1 max-h-40 overflow-y-auto">
          {results.map((v) => (
            <button
              key={v.id}
              onMouseDown={() => handlePick(v)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 transition-colors flex items-center justify-between gap-2"
            >
              <span className="text-text-base truncate">{v.name}</span>
              <span className="text-sm text-text-subtle shrink-0">
                {[v.city, v.region].filter(Boolean).join(", ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
