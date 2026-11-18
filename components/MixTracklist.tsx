"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtDur, scSearchUrl } from "./TrackList";

export type Mix = {
  id: string; title: string; dj_name: string | null; show_or_channel: string | null; uploaded_at: string | null; duration_seconds: number | null;
  artwork_url: string | null; source_url: string; embed_url: string | null; tracklist_status: string; tracklist_origin: string | null;
};
type Entry = { position: number; artist_name: string | null; title: string | null; label_name: string | null; timestamp_seconds: number | null; tracklist_source_url: string };

const ORIGIN: Record<string, string> = { description: "YouTube description", comments: "YouTube comments", "1001tracklists": "1001Tracklists" };
export const tlSearchUrl = (q: string) => `https://www.1001tracklists.com/search/result.php?main_search=${encodeURIComponent(q)}&search_selection=9`;
const link = "text-white/60 underline hover:text-[#c6ff00]";

/** The "Tracklist" dropdown under each mix. Entries load from the database the first time it is opened. */
export function MixTracklist({ mix }: { mix: Mix }) {
  const has = mix.tracklist_status === "matched";
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  async function onToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    if (!e.currentTarget.open || !has || entries !== null) return;
    const { data, error } = await createClient().from("tracklist_entries")
      .select("position,artist_name,title,label_name,timestamp_seconds,tracklist_source_url").eq("mix_id", mix.id).order("position");
    if (error) setErr(error.message);
    setEntries((data ?? []) as Entry[]);
  }

  async function copy() {
    const text = (entries ?? []).map((x) => `${fmtDur(x.timestamp_seconds) ? fmtDur(x.timestamp_seconds) + " " : ""}${x.artist_name} - ${x.title}`).join("\n");
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  }

  const query = `${mix.dj_name ?? mix.show_or_channel ?? ""} ${mix.title}`.trim();
  return (
    <details onToggle={onToggle} className="pb-2 pl-14 text-sm">
      <summary className="cursor-pointer select-none text-xs uppercase tracking-widest text-white/50 hover:text-[#c6ff00]">
        {has ? "Tracklist" : "Tracklist not found yet"}
      </summary>
      {has ? (
        <div className="mt-2">
          {err && <p className="text-red-400">Database error: {err}</p>}
          {entries === null ? <p className="text-white/50">Loading…</p> : (
            <>
              <ol className="space-y-1">
                {entries.map((x) => (
                  <li key={x.position} className="flex gap-3">
                    <span className="w-14 shrink-0 text-right text-xs tabular-nums text-white/40">{fmtDur(x.timestamp_seconds) ?? x.position}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{x.title}</span><span className="text-white/60"> – {x.artist_name}</span>
                      {x.label_name && <span className="text-white/40"> [{x.label_name}]</span>}
                    </span>
                    <a href={scSearchUrl(`${x.artist_name} ${x.title}`)} target="_blank" rel="noreferrer" title="Search on SoundCloud" className="shrink-0 text-[10px] font-bold uppercase text-white/40 hover:text-[#c6ff00]">SC</a>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-white/40">
                Source: <a href={entries[0]?.tracklist_source_url ?? mix.source_url} target="_blank" rel="noreferrer" className={link}>{ORIGIN[mix.tracklist_origin ?? ""] ?? "original post"}</a>
                {" · "}<button onClick={copy} className={link}>{copied ? "Copied" : "Copy tracklist"}</button>
              </p>
            </>
          )}
        </div>
      ) : (
        <p className="mt-2 text-white/50">
          No tracklist in the description or comments yet.{" "}
          <a href={tlSearchUrl(query)} target="_blank" rel="noreferrer" className={link}>Search 1001Tracklists ↗</a>{" · "}
          <a href={mix.source_url} target="_blank" rel="noreferrer" className={link}>Check the YouTube comments ↗</a>
        </p>
      )}
    </details>
  );
}
