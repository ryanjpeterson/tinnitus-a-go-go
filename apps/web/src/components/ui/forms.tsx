/**
 * Form fields: a label above, the field, then a hint or an error under it.
 * Errors are inline, in the highlight colour, and keep what was typed.
 *
 * - `TextField` — one line (text, email, number, password, URL…).
 * - `TextArea` — several lines; grows with its text, counts down to a limit.
 * - `DateField` — a date, time or both, with the platform's own picker
 *   (the phone wheel on iOS, the calendar on Android and desktop).
 * - `FileDrop` — pick or drop files; checks type and size and lists them.
 *
 * SearchField, SelectField, Autocomplete, RangeField and ColorPicker are in
 * the kit. All of them are 48 px tall on phones, 44 from `sm:` up.
 *
 * jimbo-ui reference: copy into an app as is.
 */

import { useId, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** The label, hint and error around a field, wired up with ids for screen readers. */
function FieldFrame({ id, label, hint, error, optional, counter, className, children }: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  counter?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("block", className)}>
      <label htmlFor={id} className="label flex items-baseline justify-between gap-3">
        <span>{label}{optional && <span className="ml-1.5 font-normal text-text-subtle">optional</span>}</span>
        {counter}
      </label>
      {children}
      {error
        ? <p id={`${id}-msg`} className="mt-1.5 flex items-start gap-1.5 text-sm font-semibold text-highlight">
            <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></svg>
            {error}
          </p>
        : hint && <p id={`${id}-msg`} className="mt-1.5 text-sm text-text-subtle">{hint}</p>}
    </div>
  );
}

const fieldCls = (error: ReactNode) => cn("field w-full", error ? "border-highlight focus:border-highlight focus:ring-highlight/25" : "");

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "size" | "prefix">;

/**
 * One line of text with its label, an optional hint, and an error once
 * there is one (`error` — say what to do: "Add an @ and a domain"). `prefix`
 * and `suffix` sit inside the field ("$", "kg", a show-password button).
 */
export function TextField({ label, value, onChange, hint, error, optional, prefix, suffix, className, id: given, ...rest }: InputProps & {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  error?: ReactNode;
  /** Marks it "optional" beside the label (required ones aren't marked). */
  optional?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
}) {
  const auto = useId();
  const id = given ?? auto;
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} optional={optional} className={className}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-15 text-text-subtle">{prefix}</span>}
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-msg` : undefined} {...rest}
          className={cn(fieldCls(error), "h-12 sm:h-11", prefix && "pl-9", suffix && "pr-12")} />
        {suffix && <span className="absolute inset-y-0 right-1 flex items-center">{suffix}</span>}
      </div>
    </FieldFrame>
  );
}

/**
 * Several lines of text. Grows with what's typed (from `rows` up to
 * `maxRows`), and with `maxLength` counts what's left beside the label once
 * it's close.
 */
export function TextArea({ label, value, onChange, hint, error, optional, rows = 3, maxRows = 10, maxLength, placeholder, className }: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  rows?: number;
  maxRows?: number;
  maxLength?: number;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || 24;
    const frame = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = "auto";
    const want = el.scrollHeight + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const most = maxRows * line + frame;
    el.style.height = `${Math.min(Math.max(want, rows * line + frame), most)}px`;
    el.style.overflowY = want > most ? "auto" : "hidden";
  }, [value, rows, maxRows]);
  const left = maxLength != null ? maxLength - value.length : null;
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} optional={optional} className={className}
      counter={left != null && left <= Math.max(20, maxLength! * 0.1) && (
        <span className={cn("text-xs font-medium tabular-nums", left < 0 ? "text-highlight" : "text-text-subtle")} aria-live="polite">{left} left</span>
      )}>
      <textarea ref={ref} id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} maxLength={maxLength} placeholder={placeholder}
        aria-invalid={error ? true : undefined} aria-describedby={error || hint ? `${id}-msg` : undefined}
        className={cn(fieldCls(error), "block resize-none py-3 leading-relaxed")} />
    </FieldFrame>
  );
}

const DATE_ICON = {
  date: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  time: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
};

/**
 * A date, a time, or both, as `YYYY-MM-DD` / `HH:MM` / `YYYY-MM-DDTHH:MM`
 * strings, with the platform's own picker — the one people know on each
 * phone, and the page's light or dark scheme. `min` and `max` in the same
 * form. For a few fixed days, use ToggleGrid; for a range, two DateFields.
 */
export function DateField({ label, value, onChange, type = "date", min, max, hint, error, optional, className }: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  type?: "date" | "time" | "datetime-local";
  min?: string;
  max?: string;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} optional={optional} className={className}>
      <div className="relative">
        <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-subtle" width="18" height="18" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {DATE_ICON[type === "time" ? "time" : "date"]}
        </svg>
        {/* The picker button is the whole field: the platform's own icon is hidden (ours sits left). */}
        <input id={id} type={type} value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined} aria-describedby={error || hint ? `${id}-msg` : undefined}
          className={cn(fieldCls(error), "h-12 appearance-none pl-10 tabular-nums sm:h-11",
            "[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-auto [&::-webkit-calendar-picker-indicator]:w-auto [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0",
            "[&::-webkit-date-and-time-value]:text-left", !value && "text-text-subtle")} />
      </div>
    </FieldFrame>
  );
}

/** 1536 → "1.5 KB". */
export function fileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes, u = 0;
  while (n >= 1024 && u < units.length - 1) { n /= 1024; u++; }
  return `${u === 0 ? n : n.toFixed(n < 10 ? 1 : 0)} ${units[u]}`;
}

/** Whether a file fits an `accept` list ("image/*,.pdf"). */
function accepts(file: File, accept?: string): boolean {
  if (!accept) return true;
  return accept.split(",").map((a) => a.trim().toLowerCase()).some((a) =>
    a.startsWith(".") ? file.name.toLowerCase().endsWith(a) : a.endsWith("/*") ? file.type.startsWith(a.slice(0, -1)) : file.type === a);
}

/**
 * Pick files or drop them: a dashed drop area (the whole area is the
 * button — tap, Enter or drag onto it), then the files picked, each with its
 * size and a Remove. Files of the wrong type or over `maxSize` are turned
 * away with a line saying why. Controlled: `files` and `onChange`.
 */
export function FileDrop({ label, files, onChange, accept, multiple = false, maxSize, hint, className }: {
  label: ReactNode;
  files: File[];
  onChange: (files: File[]) => void;
  /** As the input's `accept`: "image/*", ".csv,.json". */
  accept?: string;
  multiple?: boolean;
  /** Largest file, in bytes. */
  maxSize?: number;
  /** What's allowed, in words ("PNG or JPEG, up to 5 MB"). */
  hint?: ReactNode;
  className?: string;
}) {
  const id = useId();
  const [over, setOver] = useState(false);
  const [refused, setRefused] = useState<string[]>([]);
  const add = (list: FileList | null) => {
    if (!list) return;
    const ok: File[] = [], no: string[] = [];
    for (const f of [...list]) {
      if (!accepts(f, accept)) no.push(`${f.name} isn't a type this takes`);
      else if (maxSize != null && f.size > maxSize) no.push(`${f.name} is over ${fileSize(maxSize)}`);
      else ok.push(f);
    }
    setRefused(no);
    if (ok.length) onChange(multiple ? [...files, ...ok] : ok.slice(0, 1));
  };
  return (
    <div className={cn("space-y-2", className)}>
      <p className="label mb-0" id={`${id}-label`}>{label}</p>
      <label htmlFor={id}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        className={cn(
          "flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors",
          "has-[:focus-visible]:border-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/25",
          over ? "border-accent bg-accent/10" : "border-border bg-surface-2/50 hover:border-text-subtle",
        )}>
        <svg className={over ? "text-accent" : "text-text-subtle"} width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
        </svg>
        <span className="text-15 font-semibold"><span className="text-accent">Choose {multiple ? "files" : "a file"}</span><span className="hidden sm:inline"> or drop {multiple ? "them" : "it"} here</span></span>
        {hint && <span className="text-sm text-text-subtle">{hint}</span>}
        <input id={id} type="file" accept={accept} multiple={multiple} aria-labelledby={`${id}-label`} className="sr-only"
          onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </label>
      {refused.length > 0 && (
        <ul className="space-y-1" aria-live="polite">
          {refused.map((r) => <li key={r} className="text-sm font-semibold text-highlight">{r}</li>)}
        </ul>
      )}
      {files.length > 0 && (
        <ul className="card divide-etched overflow-hidden">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex min-h-14 items-center gap-3 py-1.5 pl-4 pr-1.5">
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 font-mono text-10 font-bold uppercase text-text-subtle">
                {f.name.split(".").pop()?.slice(0, 4)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-15 font-semibold">{f.name}</span>
                <span className="block text-xs text-text-subtle">{fileSize(f.size)}</span>
              </span>
              <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="link-action h-11 shrink-0 px-3">Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
