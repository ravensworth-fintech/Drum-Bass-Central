"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { LikeButton } from "./LikeButton";
import { DownloadPdfButton } from "./DownloadPdfButton";

export type Track = {
  id: string; title: string; artist_name: string; subgenre: string;
  artwork_url: string | null; source_url: string; embed_url: string | null; released_on: string | null;
};

export function TrackList({ tracks, title }: { tracks: Track[]; title: string }) {
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const s = createClient();
    s.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: rows } = await s.from("liked_tracks").select("track_id");
      setLiked(new Set((rows ?? []).map((r) => r.track_id)));
    });
  }, []);

  if (!tracks.length)
    return <p className="text-white/50">No tracks yet. They appear here once the ingestion engine has scanned sources.</p>;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <DownloadPdfButton title={title} tracks={tracks.map((t) => ({ artist: t.artist_name, title: t.title }))} />
      </div>
      <ul className="divide-y divide-white/10">
        {tracks.map((t) => (
          <li key={t.id} className="py-3">
            <div className="flex items-center gap-4">
              {t.artwork_url ? <img src={t.artwork_url} alt="" loading="lazy" className="h-14 w-14 object-cover" /> : <div className="h-14 w-14 bg-white/10" />}
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{t.title}</div>
                <div className="truncate text-sm text-white/60">{t.artist_name} · {t.subgenre}{t.released_on ? ` · ${t.released_on}` : ""}</div>
              </div>
              {t.embed_url && <button onClick={() => setOpen(open === t.id ? null : t.id)} className="text-xs uppercase tracking-widest text-white/70 hover:text-[#c6ff00]">{open === t.id ? "Close" : "Listen"}</button>}
              <a href={t.source_url} target="_blank" rel="noreferrer" className="text-xs text-white/40 hover:text-white">Source</a>
              <LikeButton key={t.id + liked.has(t.id)} trackId={t.id} initiallyLiked={liked.has(t.id)} />
            </div>
            {open === t.id && t.embed_url && (
              <iframe src={t.embed_url} loading="lazy" className="mt-3 h-40 w-full border-0" allow="encrypted-media" />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
