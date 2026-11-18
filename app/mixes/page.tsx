import { db } from "@/lib/supabase-server";
import { Mix } from "@/components/MixTracklist";
import { MixesBrowser } from "@/components/MixesBrowser";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function Mixes() {
  let initial: Mix[] = [], channels: string[] = [], error = "";
  try {
    const first = await db().from("mixes")
      .select("id,title,dj_name,show_or_channel,uploaded_at,duration_seconds,artwork_url,source_url,embed_url,tracklist_status,tracklist_origin")
      .order("uploaded_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(0, 30); // 31 rows: the browser component shows 30 and uses the extra to know there is more
    if (first.error) error = first.error.message; else initial = (first.data ?? []) as Mix[];
    const ch = await db().from("mixes").select("show_or_channel").not("show_or_channel", "is", null).limit(1000);
    channels = Array.from(new Set((ch.data ?? []).map((r) => r.show_or_channel as string))).sort((a, b) => a.localeCompare(b));
  } catch (e) { error = String(e); }
  return (
    <>
      <h1 className="mb-6 text-3xl font-black uppercase">Mixes</h1>
      {error && <p className="mb-4 text-red-400">Database error: {error}</p>}
      <MixesBrowser initial={initial} channels={channels} />
    </>
  );
}
