"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { Track } from "./TrackList";

/* eslint-disable @typescript-eslint/no-explicit-any */
// ONE persistent YouTube player (official IFrame API) that lives in the layout. Because the same player keeps
// running and just loads the next video, browsers let playback continue to the next track while the tab is in the background.
type Ctx = { current: Track | null; playing: boolean; play: (t: Track, queue: Track[]) => void; toggle: () => void };
const PlayerCtx = createContext<Ctx>({ current: null, playing: false, play: () => {}, toggle: () => {} });
export const usePlayer = () => useContext(PlayerCtx);

export const isYT = (t: Track) => !!t.embed_url?.includes("youtube.com/embed/");
const vidOf = (t: Track) => t.embed_url!.split("/embed/")[1].split(/[?&#]/)[0];

let ytReady: Promise<any> | null = null;
function loadYT(): Promise<any> {
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve) => {
    const w = window as any;
    if (w.YT?.Player) return resolve(w.YT);
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(w.YT); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return ytReady;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<any>(null);
  const ready = useRef(false);
  const queue = useRef<Track[]>([]);
  const cur = useRef<Track | null>(null);
  const stepRef = useRef<(d: 1 | -1) => void>(() => {});
  const [current, setCurrent] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);

  const load = useCallback((t: Track) => {
    cur.current = t;
    setCurrent(t);
    if (ready.current) { player.current.loadVideoById(vidOf(t)); return; }
    if (player.current) return; // still starting up: onReady loads cur.current
    loadYT().then((YT) => {
      if (player.current || !host.current) return;
      const el = document.createElement("div");
      host.current.appendChild(el);
      player.current = new YT.Player(el, {
        width: "100%", height: "100%",
        playerVars: { rel: 0, playsinline: 1, origin: window.location.origin },
        events: {
          onReady: () => { ready.current = true; if (cur.current) player.current.loadVideoById(vidOf(cur.current)); },
          onStateChange: (e: any) => {
            if (e.data === 0) stepRef.current(1); // ended -> next track
            else if (e.data === 1) setPlaying(true);
            else if (e.data === 2) setPlaying(false);
          },
          onError: () => stepRef.current(1), // embedding blocked -> skip
        },
      });
    });
  }, []);

  stepRef.current = (d) => {
    const q = queue.current;
    const i = q.findIndex((x) => x.id === cur.current?.id);
    const next = d === 1 ? q.slice(i + 1).find(isYT) : q.slice(0, Math.max(i, 0)).reverse().find(isYT);
    if (next) load(next); else if (d === 1) setPlaying(false);
  };

  const play = useCallback((t: Track, list: Track[]) => { queue.current = list; load(t); }, [load]);
  const toggle = useCallback(() => {
    const p = player.current;
    if (!ready.current) return;
    if (p.getPlayerState() === 1) p.pauseVideo(); else p.playVideo();
  }, []);
  const close = () => {
    if (ready.current) player.current.stopVideo();
    cur.current = null; setCurrent(null); setPlaying(false);
  };

  const skip = "flex h-12 w-12 items-center justify-center text-2xl text-white/80 hover:text-[#c6ff00]";
  return (
    <PlayerCtx.Provider value={{ current, playing, play, toggle }}>
      {children}
      {current && <div className="h-28" />} {/* keeps the last rows clear of the bar */}
      <div className={`fixed inset-x-0 bottom-0 z-50 border-t border-white/15 bg-black/95 backdrop-blur ${current ? "" : "hidden"}`}>
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2 sm:gap-5">
          <div className="relative aspect-video w-28 shrink-0 bg-black sm:w-44"><div ref={host} className="absolute inset-0" /></div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold sm:text-base">{current?.title}</div>
            <div className="truncate text-xs text-white/60 sm:text-sm">{current?.artist_name}</div>
          </div>
          <button onClick={() => stepRef.current(-1)} aria-label="Previous track" className={skip}>⏮</button>
          <button onClick={toggle} aria-label={playing ? "Pause" : "Play"}
            className="flex h-14 w-14 shrink-0 items-center justify-center bg-[#c6ff00] text-2xl text-black hover:bg-white">{playing ? "⏸" : "▶"}</button>
          <button onClick={() => stepRef.current(1)} aria-label="Next track" className={skip}>⏭</button>
          <button onClick={close} aria-label="Close player" className="ml-1 px-2 text-lg text-white/40 hover:text-white">✕</button>
        </div>
      </div>
    </PlayerCtx.Provider>
  );
}
