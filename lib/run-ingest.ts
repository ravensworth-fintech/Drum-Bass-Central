// The "scan every enabled YouTube source" job, shared by the scheduled /api/ingest run and the INGEST button.
import { admin } from "@/lib/supabase-admin";
import { scanSource, Source } from "@/lib/scan-source";
import { scanSoundcloud } from "@/lib/scan-soundcloud";

/** YouTube channels and SoundCloud accounts are scanned by different code; the source row's `kind` picks which. */
export const scanAny = (sb: ReturnType<typeof admin>, s: Source) => (s.kind === "soundcloud" ? scanSoundcloud(sb, s) : scanSource(sb, s));

/**
 * Least-recently-scanned first, in batches of 8, stopping after ~40 seconds. If the list is long, run it again.
 * `since` (an ISO time) skips every source that already has a scan logged at or after that time, so repeated
 * calls work through the whole list once instead of re-scanning the same sources.
 */
export async function runIngest(sb: ReturnType<typeof admin>, since?: string) {
  const { data: sources, error } = await sb.from("sources").select("id,name,url,kind,platform_id,is_artist,genre").in("kind", ["youtube", "soundcloud"]).eq("enabled", true)
    .order("last_success_at", { ascending: true, nullsFirst: true });
  if (error) throw new Error(error.message);
  let list = (sources ?? []) as Source[];
  if (since) {
    const { data: done } = await sb.from("scan_history").select("source_id").gte("started_at", since).limit(1000);
    const seen = new Set((done ?? []).map((d) => d.source_id as string));
    list = list.filter((s) => !seen.has(s.id));
  }
  const started = Date.now();
  const results: Awaited<ReturnType<typeof scanAny>>[] = [];
  let i = 0;
  for (; i < list.length && Date.now() - started < 40_000; i += 8) {
    results.push(...(await Promise.all(list.slice(i, i + 8).map((s) => scanAny(sb, s)))));
  }
  return { total: list.length, results, notReached: list.slice(i).map((s) => s.name) };
}
