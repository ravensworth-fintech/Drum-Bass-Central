"use client";

/** Desktop search box: small until you click into it, then it grows to fill the row. The page hides its other controls while `open`
 *  (the parent keeps the flag via onOpenChange) so everything stays on one line. Press Esc to leave it. */
export function CollapsibleSearch({ value, onChange, placeholder, open, onOpenChange }: {
  value: string; onChange: (v: string) => void; placeholder: string; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
      onFocus={() => onOpenChange(true)} onBlur={() => onOpenChange(false)}
      onKeyDown={(e) => { if (e.key === "Escape") (e.currentTarget as HTMLInputElement).blur(); }}
      className={`border border-white/20 bg-transparent px-3 py-1.5 text-sm transition-[width] duration-200 ${open ? "w-full" : "w-36"}`} />
  );
}
