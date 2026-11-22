// SERVER ONLY. Checks the Supabase login token sent by the browser and that the account has profiles.is_admin = true.
import { requireUser } from "@/lib/require-user";
import { admin } from "@/lib/supabase-admin";

export type AdminCheck = { ok: true; sb: ReturnType<typeof admin>; userId: string } | { ok: false; error: string; status: number };

export async function requireAdmin(req: Request): Promise<AdminCheck> {
  const u = await requireUser(req);
  if (!u.ok) return u;
  if (!u.isAdmin) return { ok: false, error: "This account is not an admin.", status: 403 };
  return { ok: true, sb: u.sb, userId: u.userId };
}
