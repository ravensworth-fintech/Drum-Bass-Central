import { db } from "@/lib/supabase-server";
import { Track } from "@/components/TrackList";
import { TracksBrowser } from "@/components/TracksBrowser";

/** Shared by Discover (D&B + House), D&B, House and Bands. The first 30 tracks are drawn on the server; "Load more" fetches the next 30. */
export async function TracksPage({ genre, heading }: { genre?: "dnb" | "house" | "bands"; heading: string }) {
  let initial: Track[] = [], channels: string[] = [], error = "";
  try {
    let first = db().from("tracks").select("*")
      .order("released_on", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(0, 30); // 31 rows: the browser component shows 30 and uses the extra to know there is more
    first = genre ? first.eq("genre", genre) : first.in("genre", ["dnb", "house"]);
    const res = await first;
    if (res.error) error = res.error.message; else initial = (res.data ?? []) as Track[];
    let ch = db().from("tracks").select("source_name").not("source_name", "is", null).limit(1000);
    ch = genre ? ch.eq("genre", genre) : ch.in("genre", ["dnb", "house"]);
    const cr = await ch;
    channels = Array.from(new Set((cr.data ?? []).map((r) => r.source_name as string))).sort((a, b) => a.localeCompare(b));
  } catch (e) { error = String(e); }
  return (
    <>
      <h1 className="mb-4 text-2xl font-black uppercase sm:mb-6 sm:text-3xl">{heading}</h1>
      {error && <p className="mb-4 text-red-400">Database error: {error}</p>}
      <TracksBrowser initial={initial} channels={channels} genre={genre} label={heading} />
    </>
  );
}
