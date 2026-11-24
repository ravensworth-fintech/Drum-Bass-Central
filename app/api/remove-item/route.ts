import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

/** Body: { kind: "track" | "mix", id }. Removes the song/mix from the signed-in person's own lists (nobody else is affected,
 *  and scanning the channel again does not bring it back). A removed track also loses its like. */
export async function POST(req: Request) {
  const u = await requireUser(req);
  if (!u.ok) return fail(u.error, u.status);
  let body: { kind?: string; id?: string };
  try { body = await req.json(); } catch { return fail("Bad request."); }
  const kind = body.kind === "mix" ? "mix" : body.kind === "track" ? "track" : null;
  if (!kind || !body.id || !/^[0-9a-f-]{36}$/i.test(body.id)) return fail("Bad request.");
  const { error } = await u.sb.from("hidden_items").upsert({ user_id: u.userId, kind, item_id: body.id }, { onConflict: "user_id,kind,item_id", ignoreDuplicates: true });
  if (error) return fail(`${error.message}. If this says the table is missing or permission denied, run supabase/add_remove_and_status.sql in the Supabase SQL Editor.`, 500);
  if (kind === "track") await u.sb.from("liked_tracks").delete().match({ user_id: u.userId, track_id: body.id });
  return NextResponse.json({ ok: true });
}
