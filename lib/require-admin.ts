// SERVER ONLY. Checks the Supabase login token sent by the browser and that the account has profiles.is_admin = true.
import { admin } from "@/lib/supabase-admin";

export type AdminCheck = { ok: true; sb: ReturnType<typeof admin> } | { ok: false; error: string; status: number };

export async function requireAdmin(req: Request): Promise<AdminCheck> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, error: "Sign in first.", status: 401 };
  const sb = admin();
  const { data: auth, error } = await sb.auth.getUser(token);
  if (error || !auth.user) return { ok: false, error: "Your sign-in has expired. Sign in again.", status: 401 };
  const { data: profile } = await sb.from("profiles").select("is_admin").eq("id", auth.user.id).maybeSingle();
  if (!profile?.is_admin) return { ok: false, error: "This account is not an admin.", status: 403 };
  return { ok: true, sb };
}
