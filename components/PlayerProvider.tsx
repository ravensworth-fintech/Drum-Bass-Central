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

  const btn = "px-1 text-white/70 hover:text-[#c6ff00]";
  return (
    <PlayerCtx.Provider value={{ current, playing, play, toggle }}>
      {children}
      <div className={`fixed bottom-3 right-3 z-50 w-60 border border-white/15 bg-black shadow-xl ${current ? "" : "hidden"}`}>
        <div className="relative aspect-video w-full bg-black"><div ref={host} className="absolute inset-0" /></div>
        <div className="flex items-center gap-1 px-2 py-1.5 text-xs">
          <div className="min-w-0 flex-1 truncate"><span className="font-semibold">{current?.title}</span><span className="text-white/60"> – {current?.artist_name}</span></div>
          <button onClick={() => stepRef.current(-1)} aria-label="Previous track" className={btn}>⏮</button>
          <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} className={btn}>{playing ? "⏸" : "▶"}</button>
          <button onClick={() => stepRef.current(1)} aria-label="Next track" className={btn}>⏭</button>
          <button onClick={close} aria-label="Close player" className={btn}>✕</button>
        </div>
      </div>
    </PlayerCtx.Provider>
  );
}
