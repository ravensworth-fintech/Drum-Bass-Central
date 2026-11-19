"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { AddSource } from "@/components/AddSource";

export function AuthNav() {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const checkAdmin = async (id?: string) => {
      if (!id) { setAdmin(false); return; }
      const { data } = await supabase.from("profiles").select("is_admin").eq("id", id).maybeSingle();
      setAdmin(!!data?.is_admin);
    };
    supabase.auth.getUser().then(({ data }) => { setEmail(data.user?.email ?? null); setReady(true); checkAdmin(data.user?.id); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => { setEmail(session?.user?.email ?? null); checkAdmin(session?.user?.id); });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <span className="ml-auto" />;
  if (!email) return <Link href="/login" className="ml-auto text-sm text-white/50 hover:text-white">Sign in</Link>;
  return (
    <div className="ml-auto flex items-center gap-4 text-sm text-white/50">
      {admin && <AddSource />}
      <span className="hidden max-w-[14rem] truncate sm:inline">{email}</span>
      <button onClick={async () => { await createClient().auth.signOut(); window.location.href = "/"; }} className="hover:text-white">Sign out</button>
    </div>
  );
}
