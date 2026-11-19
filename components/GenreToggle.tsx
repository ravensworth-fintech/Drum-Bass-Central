"use client";
export type Genre = "" | "dnb" | "house" | "bands";
const GENRES: { key: Genre; label: string }[] = [{ key: "", label: "All" }, { key: "dnb", label: "D&B" }, { key: "house", label: "House" }, { key: "bands", label: "Bands" }];

/** The All / D&B / House pills (plus Bands where withBands is set). Mixes has no Bands: that tab is tracks-only. */
export function GenreToggle({ value, onChange, withBands }: { value: Genre; onChange: (g: Genre) => void; withBands?: boolean }) {
  return (
    <div className="flex">
      {GENRES.filter((g) => withBands || g.key !== "bands").map((g) => (
        <button key={g.key} onClick={() => onChange(g.key)} aria-pressed={value === g.key}
          className={`border px-3 py-1.5 text-xs font-bold uppercase tracking-widest ${value === g.key ? "border-[#c6ff00] bg-[#c6ff00] text-black" : "border-white/20 text-white/70 hover:text-white"}`}>{g.label}</button>
      ))}
    </div>
  );
}
