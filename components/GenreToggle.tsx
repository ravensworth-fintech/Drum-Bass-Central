"use client";
import { useIsMobile } from "@/components/DeviceProvider";
import type { GenreKey } from "@/lib/genres";
export type Genre = "" | "dnb" | "house" | "dubstep" | "bands";
const GENRES: { key: Genre; label: string }[] = [{ key: "", label: "All" }, { key: "dnb", label: "D&B" }, { key: "house", label: "House" }, { key: "dubstep", label: "Dubstep" }, { key: "bands", label: "Bands" }];

/** The All / D&B / House / Dubstep pills (plus Bands where withBands is set). Mixes has no Bands: that tab is tracks-only. */
export function GenreToggle({ value, onChange, withBands }: { value: Genre; onChange: (g: Genre) => void; withBands?: boolean }) {
  const m = useIsMobile();
  return (
    <div className={m ? "flex w-full" : "flex"}>
      {GENRES.filter((g) => withBands || g.key !== "bands").map((g) => (
        <button key={g.key} onClick={() => onChange(g.key)} aria-pressed={value === g.key}
          className={`border text-xs font-bold uppercase tracking-widest ${m ? "flex-1 py-2.5" : "px-3 py-1.5"} ${value === g.key ? "border-[#c6ff00] bg-[#c6ff00] text-black" : "border-white/20 text-white/70 hover:text-white"}`}>{g.label}</button>
      ))}
    </div>
  );
}

const FRESH: { key: GenreKey; label: string }[] = [{ key: "dnb", label: "D&B" }, { key: "house", label: "House" }, { key: "dubstep", label: "Dubstep" }];

/** Fresh Fire's genre buttons: any number can be pressed at once, and only the pressed genres are shown. None pressed = everything. */
export function MultiGenreToggle({ values, onToggle }: { values: GenreKey[]; onToggle: (g: GenreKey) => void }) {
  const m = useIsMobile();
  return (
    <div className={m ? "flex w-full" : "flex"} role="group" aria-label="Genres">
      {FRESH.map((g) => (
        <button key={g.key} onClick={() => onToggle(g.key)} aria-pressed={values.includes(g.key)}
          className={`border text-xs font-bold uppercase tracking-widest ${m ? "flex-1 py-2.5" : "px-3 py-1.5"} ${values.includes(g.key) ? "border-[#c6ff00] bg-[#c6ff00] text-black" : "border-white/20 text-white/70 hover:text-white"}`}>{g.label}</button>
      ))}
    </div>
  );
}
