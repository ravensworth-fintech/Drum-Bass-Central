import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase-admin";
import { runDiscover } from "@/lib/discover";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The daily Discover job (called by the Supabase schedule in supabase/schedule_ingest.sql). Same secret as /api/ingest.
 *  By hand: /api/discover?secret=YOUR_CRON_SECRET  (optional &max=5 to cap how many channel searches it makes; each costs 100 YouTube quota units). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set in the environment" }, { status: 500 });
  const url = new URL(req.url);
  const given = req.headers.get("authorization")?.replace("Bearer ", "") ?? url.searchParams.get("secret");
  if (given !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const max = Number(url.searchParams.get("max"));
  try {
    return NextResponse.json({ ran_at: new Date().toISOString(), discover: await runDiscover(admin(), Number.isFinite(max) && max > 0 ? { maxSearches: max } : {}) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
