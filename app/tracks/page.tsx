import { db } from "@/lib/supabase-server";
import { Track } from "@/components/TrackList";
import { TracksBrowser } from "@/components/TracksBrowser";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function Tracks() {
  let initial: Track[] = [], channels: string[] = [], error = "";
  try {
    const first = await db().from("tracks").select("*")
      .order("released_on", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(0, 30); // 31 rows: the browser component shows 30 and uses the extra to know there is more
    if (first.error) error = first.error.message; else initial = (first.data ?? []) as Track[];
    const ch = await db().from("tracks").select("source_name").not("source_name", "is", null).limit(1000);
    channels = Array.from(new Set((ch.data ?? []).map((r) => r.source_name as string))).sort((a, b) => a.localeCompare(b));
  } catch (e) { error = String(e); }
  return (
    <>
      <h1 className="mb-6 text-3xl font-black uppercase">Tracks</h1>
      {error && <p className="mb-4 text-red-400">Database error: {error}</p>}
      <TracksBrowser initial={initial} channels={channels} />
    </>
  );
}
