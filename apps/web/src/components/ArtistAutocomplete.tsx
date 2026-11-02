import { useRef, useState } from "react";
import { api, type ArtistListItem } from "@/lib/api";

/** Artist name input that suggests existing artists (with their show counts) as you type. */
export function ArtistAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Artist name",
}: {
  value: string;
  onChange: (val: string) => void;
  onSelect: (name: string) => void;
  placeholder?: string;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [results, setResults] = useState<ArtistListItem[]>([]);
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
      api.listArtists({ q: val, limit: 6 }).then((r) => {
        if (r.artists.length > 0) {
          setResults(r.artists);
          setShowDrop(true);
        } else {
          setResults([]);
          setShowDrop(false);
        }
      }).catch(() => {});
    }, 280);
  };

  const handlePick = (a: ArtistListItem) => {
    onSelect(a.name);
    setResults([]);
    setShowDrop(false);
  };

  return (
    <div className="relative flex-1">
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => results.length > 0 && setShowDrop(true)}
        onBlur={() => setTimeout(() => setShowDrop(false), 150)}
        placeholder={placeholder}
        className="w-full field h-11"
      />
      {showDrop && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-40 mt-1 bg-surface border border-border rounded-lg shadow-xl py-1 max-h-40 overflow-y-auto">
          {results.map((a) => (
            <button
              key={a.id}
              onMouseDown={() => handlePick(a)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 transition-colors flex items-center justify-between gap-2"
            >
              <span className="text-text-base truncate">{a.name}</span>
              <span className="text-sm text-text-subtle shrink-0">{a.showCount} shows</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
