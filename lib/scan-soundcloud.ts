// Scans one SoundCloud account through its public RSS feed. Same sorting, dedupe and logging as the YouTube scanner (lib/scan-source.ts).
import { cleanMixTitle, guessDj, isMixTitle, SKIP_WORDS } from "@/lib/mixes";
import { normKey, parseTrack } from "@/lib/youtube-feed";
import { fetchScFeed, resolveScUser } from "@/lib/soundcloud-feed";
import { parseTracklist } from "@/lib/tracklist";
import { saveTracklist, SB, Source } from "@/lib/scan-source";

const scEmbed = (link: string) => `https://w.soundcloud.com/player/?url=${encodeURIComponent(link)}`;

export async function scanSoundcloud(sb: SB, src: Source) {
  const startedAt = new Date().toISOString();
  let found = 0, added = 0, skipped = 0, mixesAdded = 0, tracklistsFound = 0;
  try {
    let userId = src.platform_id;
    if (!userId) {
      userId = await resolveScUser(src.url);
      await sb.from("sources").update({ platform_id: userId }).eq("id", src.id);
    }
    let feed = await fetchScFeed(userId);
    if (!feed.items.length) { await new Promise((r) => setTimeout(r, 1500)); feed = await fetchScFeed(userId); }
    if (!feed.items.length) throw new Error(`The SoundCloud feed for "${src.name}" returned 0 tracks, twice. The account may have no public tracks, or SoundCloud may not publish an RSS feed for it. Open ${src.url} to check. It will be retried on the next scan.`);
    found = feed.items.length;

    const rows: { title: string; artist_name: string; source_url: string; platform: string; platform_id: string; embed_url: string; artwork_url: string | null; released_on: string | null; status: string; source_name: string; genre: string; norm_key: string; duration_seconds: number | null }[] = [];
    const mixRows: { title: string; dj_name: string | null; show_or_channel: string; uploaded_at: string | null; duration_seconds: number | null; artwork_url: string | null; source_url: string; platform: string; platform_id: string; embed_url: string; tracklist_status: string; status: string; genre: string }[] = [];
    for (const it of feed.items) {
      const dur = it.seconds;
      if ((dur != null && dur <= 60) || SKIP_WORDS.test(it.title)) { skipped++; continue; } // previews and non-music
      const pid = it.id ?? it.link;
      if (isMixTitle(it.title) || (dur != null && dur >= 1500)) {
        if (src.genre === "bands") { skipped++; continue; }
        const title = cleanMixTitle(it.title);
        mixRows.push({
          title, dj_name: guessDj(title) ?? (src.is_artist ? src.name : null), show_or_channel: src.name, uploaded_at: it.publishedAt, duration_seconds: dur,
          artwork_url: it.image, source_url: it.link, platform: "soundcloud", platform_id: pid, embed_url: scEmbed(it.link),
          tracklist_status: "none", status: "published", genre: src.genre ?? "dnb",
        });
        continue;
      }
      const p = parseTrack(it.title, true, src.is_artist ? src.name : undefined);
      if (!p) { skipped++; continue; }
      rows.push({
        title: p.title, artist_name: p.artist, source_url: it.link, platform: "soundcloud", platform_id: pid, embed_url: scEmbed(it.link),
        artwork_url: it.image, released_on: it.publishedAt ? it.publishedAt.slice(0, 10) : null,
        status: p.suspicious ? "pending" : "published", source_name: src.name, genre: src.genre ?? "dnb", norm_key: normKey(p.artist, p.title), duration_seconds: dur,
      });
    }

    if (mixRows.length) {
      const { data: newMixes, error: mixErr } = await sb.from("mixes").upsert(mixRows, { onConflict: "source_url", ignoreDuplicates: true }).select("id,source_url");
      if (mixErr) throw new Error(`mixes: ${mixErr.message}`);
      mixesAdded = newMixes?.length ?? 0;
      for (const m of newMixes ?? []) {
        const list = parseTracklist(feed.items.find((i) => i.link === m.source_url)?.description ?? "");
        if (list.length) { try { await saveTracklist(sb, m.id as string, list, m.source_url as string, "description"); tracklistsFound++; } catch { /* ignore */ } }
      }
    }

    // Dedupe: the same artist|title may already exist (e.g. uploaded to YouTube too). The same source_url is ignored by the upsert.
    const seen = new Set<string>();
    let fresh = rows.filter((r) => (seen.has(r.norm_key) ? false : (seen.add(r.norm_key), true)));
    if (fresh.length) {
      const { data: existing } = await sb.from("tracks").select("norm_key").in("norm_key", fresh.map((r) => r.norm_key));
      const have = new Set((existing ?? []).map((r) => r.norm_key as string));
      fresh = fresh.filter((r) => !have.has(r.norm_key));
    }
    if (fresh.length) {
      const { data, error } = await sb.from("tracks").upsert(fresh, { onConflict: "source_url", ignoreDuplicates: true }).select("id");
      if (error) throw new Error(error.message);
      added = data?.length ?? 0;
    }

    await sb.from("scan_history").insert({ source_id: src.id, started_at: startedAt, finished_at: new Date().toISOString(), ok: true, items_found: found, items_new: added });
    await sb.from("sources").update({ last_success_at: new Date().toISOString() }).eq("id", src.id);
    return { source: src.name, ok: true, channel: feed.title, channel_id: userId, found, added, mixes_added: mixesAdded, tracklists_from_description: tracklistsFound, skipped };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await sb.from("scan_history").insert({ source_id: src.id, started_at: startedAt, finished_at: new Date().toISOString(), ok: false, items_found: found, items_new: added, error });
    return { source: src.name, ok: false, error };
  }
}
