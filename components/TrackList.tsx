"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { LikeButton } from "./LikeButton";
import { DownloadPdfButton } from "./DownloadPdfButton";

export type Track = {
  id: string; title: string; artist_name: string; subgenre: string;
  artwork_url: string | null; source_url: string; embed_url: string | null; released_on: string | null; source_name: string | null;
};

export function TrackList({ tracks, title }: { tracks: Track[]; title: string }) {
  const [liked, setLiked] = useState<Set<string>>(new Set());
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
          <li key={t.id} className="py-4">
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{t.title}</div>
                <div className="truncate text-sm text-white/60">{t.artist_name} · {t.subgenre}{t.released_on ? ` · ${t.released_on}` : ""}</div>
              </div>
              <a href={t.source_url} target="_blank" rel="noreferrer" className="text-xs text-white/40 hover:text-white">{t.source_name ? `${t.source_name} ↗` : "Source ↗"}</a>
              <LikeButton key={t.id + liked.has(t.id)} trackId={t.id} initiallyLiked={liked.has(t.id)} />
            </div>
            {t.embed_url ? (
              <iframe src={t.embed_url} title={`${t.artist_name} - ${t.title}`} loading="lazy" className="mt-3 aspect-video w-full max-w-md border-0" allow="encrypted-media; picture-in-picture" allowFullScreen />
            ) : t.artwork_url ? (
              <img src={t.artwork_url} alt="" loading="lazy" className="mt-3 h-24 w-24 object-cover" />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
