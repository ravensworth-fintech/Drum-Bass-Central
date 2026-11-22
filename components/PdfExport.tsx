"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { DISCOVER_GENRES } from "@/lib/genres";
import type { PdfTrack } from "@/lib/pdf";

const LISTS = [
  { key: "fresh", label: "Fresh Fire" }, { key: "dnb", label: "D&B" }, { key: "house", label: "House" },
  { key: "dubstep", label: "Dubstep" }, { key: "bands", label: "Bands" }, { key: "likes", label: "Likes" },
] as const;
type ListKey = (typeof LISTS)[number]["key"];

/** "Artist - Title" PDF of a whole list (newest 1,000 tracks, or all your liked tracks). Moved here from the old Account menu. */
export function PdfExport() {
  const [list, setList] = useState<ListKey>("fresh");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  async function download() {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const supabase = createClient();
      let tracks: PdfTrack[] = [];
      if (list === "likes") {
        const { data, error } = await supabase.from("liked_tracks").select("liked_at, tracks(artist_name,title)").order("liked_at", { ascending: false }).limit(1000);
        if (error) throw new Error(error.message);
        tracks = ((data ?? []) as unknown as { tracks: { artist_name: string; title: string } | { artist_name: string; title: string }[] | null }[])
          .map((r) => (Array.isArray(r.tracks) ? r.tracks[0] : r.tracks))
          .filter((t): t is { artist_name: string; title: string } => !!t)
          .map((t) => ({ artist: t.artist_name, title: t.title }));
      } else {
        let q = supabase.from("tracks").select("artist_name,title").eq("status", "published")
          .order("released_on", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(1000);
        q = list === "fresh" ? q.in("genre", DISCOVER_GENRES) : q.eq("genre", list);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        tracks = (data ?? []).map((t) => ({ artist: t.artist_name as string, title: t.title as string }));
      }
      if (!tracks.length) { setMsg({ text: "Nothing in that list yet.", bad: true }); return; }
      const { downloadTrackListPdf } = await import("@/lib/pdf"); // loaded only when needed
      downloadTrackListPdf(LISTS.find((l) => l.key === list)!.label, tracks);
      setMsg({ text: `Downloaded ${tracks.length} tracks.` });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), bad: true });
    } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap" role="group" aria-label="List to export">
        {LISTS.map((l) => (
          <button key={l.key} onClick={() => setList(l.key)} aria-pressed={list === l.key}
            className={`border px-3 py-1.5 text-xs font-bold uppercase tracking-widest ${list === l.key ? "border-[#c6ff00] bg-[#c6ff00] text-black" : "border-white/20 text-white/70 hover:text-white"}`}>{l.label}</button>
        ))}
      </div>
      <button onClick={download} disabled={busy}
        className="border border-white/20 px-3 py-1.5 text-xs uppercase tracking-widest text-white/70 hover:border-[#c6ff00] hover:text-[#c6ff00] disabled:opacity-40">
        {busy ? "Preparing…" : "Download PDF"}
      </button>
      {msg && <p className={`mt-3 text-xs ${msg.bad ? "text-red-400" : "text-[#c6ff00]"}`}>{msg.text}</p>}
    </div>
  );
}
