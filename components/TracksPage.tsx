import { db } from "@/lib/supabase-server";
import { Track } from "@/components/TrackList";
import { TracksBrowser, ChannelInfo } from "@/components/TracksBrowser";
import { DISCOVER_GENRES, GenreKey } from "@/lib/genres";

/** Shared by Fresh Fire (D&B + House + Dubstep), D&B, House, Dubstep and Bands. The first 30 tracks are drawn on the server; "Load more" fetches the next 30. */
export async function TracksPage({ genre, heading }: { genre?: GenreKey; heading: string }) {
  let initial: Track[] = [], channels: ChannelInfo[] = [], error = "";
  try {
    let first = db().from("tracks").select("*")
      .order("released_on", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(0, 30); // 31 rows: the browser component shows 30 and uses the extra to know there is more
    first = genre ? first.eq("genre", genre) : first.in("genre", DISCOVER_GENRES);
    const res = await first;
    if (res.error) error = res.error.message; else initial = (res.data ?? []) as Track[];
    let ch = db().from("tracks").select("source_name,genre").not("source_name", "is", null).limit(1000);
    ch = genre ? ch.eq("genre", genre) : ch.in("genre", DISCOVER_GENRES);
    const cr = await ch;
    const seen = new Map<string, ChannelInfo>();
    for (const r of cr.data ?? []) seen.set(`${r.genre}|${r.source_name}`, { name: r.source_name as string, genre: r.genre as string });
    channels = Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) { error = String(e); }
  return (
    <>
      <h1 className="mb-4 text-2xl font-black uppercase sm:mb-6 sm:text-3xl">{heading}</h1>
      {error && <p className="mb-4 text-red-400">Database error: {error}</p>}
      <TracksBrowser initial={initial} channels={channels} genre={genre} label={heading} />
    </>
  );
}
