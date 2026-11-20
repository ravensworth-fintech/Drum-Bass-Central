"use client";
import { useState } from "react";

/** Phones only: the search box and filter buttons live under one "Search & filter" button with a down arrow. `active` is how many are in use (shown as a badge).
 *  `trailing` is for an action that should stay visible next to it (e.g. Select on Likes). */
export function MobileFilters({ active, trailing, children }: { active: number; trailing?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3">
      <div className="flex gap-2">
        <button onClick={() => setOpen(!open)} aria-expanded={open}
          className={`flex flex-1 items-center justify-between border px-3 py-2.5 text-xs font-bold uppercase tracking-widest ${open ? "border-[#c6ff00] text-[#c6ff00]" : "border-white/20 text-white/80"}`}>
          <span className="flex items-center gap-2">Search &amp; filter{active > 0 && <span className="bg-[#c6ff00] px-1.5 text-black">{active}</span>}</span>
          <span aria-hidden className={`text-base leading-none transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </button>
        {trailing}
      </div>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}
