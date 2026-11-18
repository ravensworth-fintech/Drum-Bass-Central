"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { Track } from "@/components/TrackList";
import { DownloadPdfButton } from "@/components/DownloadPdfButton";

type Row = { liked_at: string; tracks: Track };

export default function LikedClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [authed, setAuthed] = useState(true);
  const [newestFirst, setNewestFirst] = useState(true);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setAuthed(false); return; }
    const { data, error } = await supabase.from("liked_tracks").select("liked_at, tracks(*)").order("liked_at", { ascending: !newestFirst });
    if (error) setErr(error.message);
    setRows((data ?? []) as unknown as Row[]);
  }
  useEffect(() => { load(); }, [newestFirst]); // eslint-disable-line

  async function unlike(id: string) {
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("liked_tracks").delete().match({ user_id: u.user!.id, track_id: id });
    setRows((r) => r && r.filter((x) => x.tracks.id !== id));
  }

  if (!authed) return <p>Please <a className="text-[#c6ff00] underline" href="/login">sign in</a> to see your liked tracks.</p>;
  const shown = (rows ?? []).filter((r) => `${r.tracks.title} ${r.tracks.artist_name}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <h1 className="mb-6 text-3xl font-black uppercase">Liked Tracks</h1>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search liked tracks" className="border border-white/20 bg-transparent px-3 py-1.5 text-sm" />
        <button onClick={() => setNewestFirst(!newestFirst)} className="border border-white/20 px-3 py-1.5 text-xs uppercase tracking-widest">{newestFirst ? "Newest liked first" : "Oldest liked first"}</button>
        <DownloadPdfButton title="Liked Tracks" tracks={shown.map((r) => ({ artist: r.tracks.artist_name, title: r.tracks.title }))} />
      </div>
      {err && <p className="mb-4 text-red-400">Database error: {err}</p>}
      {rows && !shown.length && <p className="text-white/50">Nothing here yet.</p>}
      <ul className="divide-y divide-white/10">
        {shown.map((r) => (
          <li key={r.tracks.id} className="flex items-center gap-4 py-3">
            {r.tracks.artwork_url ? <img src={r.tracks.artwork_url} alt="" loading="lazy" className="h-14 w-14 object-cover" /> : <div className="h-14 w-14 bg-white/10" />}
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{r.tracks.title}</div>
              <div className="truncate text-sm text-white/60">{r.tracks.artist_name} · {r.tracks.subgenre} · liked {new Date(r.liked_at).toLocaleString()}</div>
            </div>
            <a href={r.tracks.source_url} target="_blank" rel="noreferrer" className="text-xs text-white/40 hover:text-white">{r.tracks.source_name ? `${r.tracks.source_name} ↗` : "Source ↗"}</a>
            <button onClick={() => unlike(r.tracks.id)} className="text-[#c6ff00]" aria-label="Unlike">♥</button>
          </li>
        ))}
      </ul>
    </>
  );
}
