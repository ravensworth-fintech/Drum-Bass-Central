import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

/** Every followed channel with its latest scan result, for the Dashboard list. Admin only. */
export async function GET(req: Request) {
  const a = await requireAdmin(req);
  if (!a.ok) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });
  const { data, error } = await a.sb.from("sources").select("id,name,url,kind,genre,enabled,is_artist,last_success_at").in("kind", ["youtube", "soundcloud"]).order("name");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const { data: hist } = await a.sb.from("scan_history").select("source_id,ok,error,started_at").order("started_at", { ascending: false }).limit(2000);
  const latest = new Map<string, { ok: boolean; error: string | null }>();
  for (const h of hist ?? []) if (!latest.has(h.source_id as string)) latest.set(h.source_id as string, { ok: !!h.ok, error: (h.error as string | null) ?? null });
  return NextResponse.json({
    ok: true,
    sources: (data ?? []).map((s) => ({ ...s, last_scan_ok: latest.get(s.id as string)?.ok ?? null, last_scan_error: latest.get(s.id as string)?.error ?? null })),
  });
}
