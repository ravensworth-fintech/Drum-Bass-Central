import { NextResponse } from "next/server";
import { db } from "@/lib/supabase-server";
export const dynamic = "force-dynamic";

// TEMPORARY: delete this file once the tracks show up on the site.
export async function GET() {
  const { data, error } = await db().from("tracks").select("title,status").limit(100);
  return NextResponse.json({
    project: (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/^https?:\/\//, ""),
    anon_key_set: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    rows_returned: data?.length ?? 0,
    error: error?.message ?? null,
    sample: (data ?? []).slice(0, 3),
  });
}
