"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { Track, TrackRow } from "@/components/TrackList";
import { DownloadPdfButton } from "@/components/DownloadPdfButton";
import { Genre, GenreToggle } from "@/components/GenreToggle";

type Row = { liked_at: string; tracks: Track };
type SortKey = "liked" | "posted" | "artist" | "title";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "liked", label: "Date liked" },
  { key: "posted", label: "Date posted" },
  { key: "artist", label: "Artist name" },
  { key: "title", label: "Song title" },
];

export default function LikedClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [authed, setAuthed] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [genre, setGenre] = useState<Genre>("");
  const [sortKey, setSortKey] = useState<SortKey>("liked");
  const [asc, setAsc] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setAuthed(false); return; }
      const { data, error } = await supabase.from("liked_tracks").select("liked_at, tracks(*)");
      if (error) setErr(error.message);
      setRows(((data ?? []) as unknown as Row[]).filter((r) => r.tracks));
    })();
  }, []);

  async function unlike(id: string) {
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("liked_tracks").delete().match({ user_id: u.user!.id, track_id: id });
    setRows((r) => r && r.filter((x) => x.tracks.id !== id));
    setSel((s) => { const n = new Set(s); n.delete(id); return n; });
  }

  function changeSort(k: SortKey) {
    setSortKey(k);
    setAsc(k === "artist" || k === "title"); // names default A-Z, dates default newest first
  }

  const channels = useMemo(
    () => Array.from(new Set((rows ?? []).filter((r) => !genre || (r.tracks.genre ?? "dnb") === genre).map((r) => r.tracks.source_name).filter(Boolean) as string[])).sort(),
    [rows, genre]
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (rows ?? []).filter((r) =>
      (!needle || `${r.tracks.title} ${r.tracks.artist_name}`.toLowerCase().includes(needle)) &&
      (!channel || r.tracks.source_name === channel) &&
      (!genre || (r.tracks.genre ?? "dnb") === genre)
    );
    const text = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
    return list.sort((a, b) => {
      let r = 0;
      if (sortKey === "liked") r = a.liked_at.localeCompare(b.liked_at);
      else if (sortKey === "posted") {
        const x = a.tracks.released_on, y = b.tracks.released_on;
        if (!x && !y) return 0;
        if (!x) return 1; // tracks with no post date always go last
        if (!y) return -1;
        r = x.localeCompare(y);
      }
      else if (sortKey === "artist") r = text(a.tracks.artist_name, b.tracks.artist_name);
      else r = text(a.tracks.title, b.tracks.title);
      return asc ? r : -r;
    });
  }, [rows, q, channel, genre, sortKey, asc]);

  function pickGenre(g: Genre) {
    setGenre(g);
    if (channel && !(rows ?? []).some((r) => r.tracks.source_name === channel && (!g || (r.tracks.genre ?? "dnb") === g))) setChannel("");
  }

  const selectedShown = shown.filter((r) => sel.has(r.tracks.id));

  function toggle(id: string) {
    setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function copyLinks() {
    const text = selectedShown.map((r) => r.tracks.source_url).join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
    }
    const n = selectedShown.length;
    setCopied(`Copied ${n} link${n === 1 ? "" : "s"}`);
    setTimeout(() => setCopied(""), 2500);
  }

  if (!authed) return <p>Please <a className="text-[#c6ff00] underline" href="/login">sign in</a> to see your likes.</p>;
  const btn = "border border-white/20 px-3 py-1.5 text-xs uppercase tracking-widest hover:border-white/50";
  return (
    <>
      <h1 className="mb-6 text-3xl font-black uppercase">Likes</h1>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <GenreToggle value={genre} onChange={pickGenre} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search likes" className="border border-white/20 bg-transparent px-3 py-1.5 text-sm" />
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className="border border-white/20 bg-black px-3 py-1.5 text-sm">
          <option value="">All channels</option>
          {channels.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={sortKey} onChange={(e) => changeSort(e.target.value as SortKey)} className="border border-white/20 bg-black px-3 py-1.5 text-sm" aria-label="Sort by">
          {SORTS.map((s) => <option key={s.key} value={s.key}>Sort: {s.label}</option>)}
        </select>
        <button onClick={() => setAsc(!asc)} className={btn}>
          {sortKey === "artist" || sortKey === "title" ? (asc ? "A → Z" : "Z → A") : (asc ? "Oldest first" : "Newest first")}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button onClick={copyLinks} disabled={!selectedShown.length}
          className="bg-[#c6ff00] px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-black disabled:opacity-30">
          Copy Links{selectedShown.length ? ` (${selectedShown.length})` : ""}
        </button>
        <button onClick={() => setSel(new Set(shown.map((r) => r.tracks.id)))} disabled={!shown.length} className={btn}>Select all shown</button>
        <button onClick={() => setSel(new Set())} disabled={!sel.size} className={btn}>Clear selection</button>
        {copied && <span className="text-sm text-[#c6ff00]">{copied}</span>}
        <div className="ml-auto">
          <DownloadPdfButton title="Likes" tracks={shown.map((r) => ({ artist: r.tracks.artist_name, title: r.tracks.title }))} />
        </div>
      </div>

      {err && <p className="mb-4 text-red-400">Database error: {err}</p>}
      {rows && !shown.length && <p className="text-white/50">{rows.length ? "No likes match." : "Nothing here yet."}</p>}
      <ul className="divide-y divide-white/10">
        {shown.map((r) => {
          const on = sel.has(r.tracks.id);
          return (
            <TrackRow key={r.tracks.id} t={r.tracks} showGenre={!genre} queue={shown.map((x) => x.tracks)} extra={`liked ${new Date(r.liked_at).toLocaleDateString()}`}
              leading={
                <button onClick={() => toggle(r.tracks.id)} aria-pressed={on} aria-label={on ? "Deselect track" : "Select track"}
                  className={`h-6 w-6 shrink-0 border text-sm font-bold leading-none ${on ? "border-[#c6ff00] bg-[#c6ff00] text-black" : "border-white/30"}`}>
                  {on ? "✓" : ""}
                </button>
              }
              action={<button onClick={() => unlike(r.tracks.id)} className="text-[#c6ff00]" aria-label="Unlike">♥</button>} />
          );
        })}
      </ul>
    </>
  );
}
