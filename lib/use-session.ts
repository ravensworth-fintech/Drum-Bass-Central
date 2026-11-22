"use client";
// Who is signed in, and whether the account is an admin (profiles.is_admin = true). Shared by the header, Dashboard and Discover.
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

export type SessionInfo = { ready: boolean; email: string | null; admin: boolean };

export function useSession(): SessionInfo {
  const [s, setS] = useState<SessionInfo>({ ready: false, email: null, admin: false });
  useEffect(() => {
    const supabase = createClient();
    let live = true;
    const apply = async (user: { id: string; email?: string | null } | null | undefined) => {
      if (!user) { if (live) setS({ ready: true, email: null, admin: false }); return; }
      const { data } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
      if (live) setS({ ready: true, email: user.email ?? null, admin: !!data?.is_admin });
    };
    supabase.auth.getUser().then(({ data }) => { apply(data.user); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => { apply(session?.user); });
    return () => { live = false; sub.subscription.unsubscribe(); };
  }, []);
  return s;
}

/** Headers for calling the admin-only API routes: the browser sends its Supabase login token. */
export async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in first.");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}
