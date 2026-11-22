import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { addAllowance } from "@/lib/follow";

export const dynamic = "force-dynamic";

const COLS = "id,name,url,kind,genre,enabled,is_artist,last_success_at";
type Src = { id: string; name: string; url: string; kind: string; genre: string | null; enabled: boolean; is_artist: boolean; last_success_at: string | null };

/**
 * Dashboard channel list. Default: the channels the signed-in person follows (any account).
 * `?scope=all` (admins only): every channel on the site, each marked with whether the admin follows it.
 * Also returns `addsLeft` (null for admins) so the page can show the daily allowance.
 */
export async function GET(req: Request) {
  const u = await requireUser(req);
  if (!u.ok) return NextResponse.json({ ok: false, error: u.error }, { status: u.status });
  const wantAll = new URL(req.url).searchParams.get("scope") === "all";
  if (wantAll && !u.isAdmin) return NextResponse.json({ ok: false, error: "This account is not an admin." }, { status: 403 });

  const mine = await u.sb.from("user_sources").select("source_id").eq("user_id", u.userId).limit(5000);
  if (mine.error) return NextResponse.json({ ok: false, error: mine.error.message }, { status: 500 });
  const followed = new Set((mine.data ?? []).map((r) => r.source_id as string));

  let list: Src[];
  if (wantAll) {
    const { data, error } = await u.sb.from("sources").select(COLS).in("kind", ["youtube", "soundcloud"]).order("name");
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    list = (data ?? []) as Src[];
  } else {
    const { data, error } = await u.sb.from("user_sources").select(`sources(${COLS})`).eq("user_id", u.userId).limit(5000);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    list = ((data ?? []) as unknown as { sources: Src | Src[] | null }[]).map((r) => (Array.isArray(r.sources) ? r.sources[0] : r.sources)).filter((s): s is Src => !!s)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const { data: hist } = await u.sb.from("scan_history").select("source_id,ok,error,started_at").order("started_at", { ascending: false }).limit(2000);
  const latest = new Map<string, { ok: boolean; error: string | null }>();
  for (const h of hist ?? []) if (!latest.has(h.source_id as string)) latest.set(h.source_id as string, { ok: !!h.ok, error: (h.error as string | null) ?? null });

  return NextResponse.json({
    ok: true,
    addsLeft: u.isAdmin ? null : (await addAllowance(u.sb, u.userId)).left,
    sources: list.map((s) => ({ ...s, followed: followed.has(s.id), last_scan_ok: latest.get(s.id)?.ok ?? null, last_scan_error: latest.get(s.id)?.error ?? null })),
  });
}
