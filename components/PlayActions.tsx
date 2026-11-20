"use client";
import { isPlayable, usePlayer } from "./PlayerProvider";
import type { Track } from "./TrackList";
import { useIsMobile } from "./DeviceProvider";
import { DiceIcon, ShuffleIcon } from "./PlayIcons";

/** Shuffle + Random buttons above a list. Random plays one random song from the list shown. Shuffle turns shuffle mode on or off
 *  (shuffle picks the next song at random from the list); if nothing from this list is playing, turning it on also starts a random song. */
export function PlayActions({ tracks, owner }: { tracks: Track[]; owner?: string }) {
  const { shuffle, setShuffle, shuffleFrom, randomPlay } = usePlayer();
  const m = useIsMobile();
  const can = tracks.some(isPlayable);
  const base = `flex items-center justify-center gap-2 border text-xs font-bold uppercase tracking-widest disabled:opacity-40 ${m ? "flex-1 py-2.5" : "px-3 py-1.5"}`;
  return (
    <div className={`mb-3 flex gap-2 ${m ? "" : "justify-end"}`}>
      <button onClick={() => (shuffle ? setShuffle(false) : shuffleFrom(tracks, owner))} disabled={!can && !shuffle} aria-pressed={shuffle}
        className={`${base} ${shuffle ? "border-[#c6ff00] text-[#c6ff00]" : "border-white/20 text-white/70 hover:border-[#c6ff00] hover:text-[#c6ff00]"}`}>
        <ShuffleIcon className="h-4 w-4" />Shuffle{shuffle ? " on" : ""}
      </button>
      <button onClick={() => randomPlay(tracks, owner)} disabled={!can}
        className={`${base} border-white/20 text-white/70 hover:border-[#c6ff00] hover:text-[#c6ff00]`}>
        <DiceIcon className="h-4 w-4" />Random
      </button>
    </div>
  );
}
