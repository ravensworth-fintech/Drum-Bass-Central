// SERVER ONLY. Checks the Supabase login token sent by the browser. Any signed-in account passes; `isAdmin` says whether profiles.is_admin = true.
import { admin } from "@/lib/supabase-admin";

export type UserCheck =
  | { ok: true; sb: ReturnType<typeof admin>; userId: string; isAdmin: boolean }
  | { ok: false; error: string; status: number };

export async function requireUser(req: Request): Promise<UserCheck> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, error: "Sign in first.", status: 401 };
  const sb = admin();
  const { data: auth, error } = await sb.auth.getUser(token);
  if (error || !auth.user) return { ok: false, error: "Your sign-in has expired. Sign in again.", status: 401 };
  const { data: profile } = await sb.from("profiles").select("is_admin").eq("id", auth.user.id).maybeSingle();
  return { ok: true, sb, userId: auth.user.id, isAdmin: !!profile?.is_admin };
}
