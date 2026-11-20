"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { AddSource } from "@/components/AddSource";
import { IngestButton } from "@/components/IngestButton";
import { useDeviceView } from "@/components/DeviceProvider";

export function AuthNav() {
  const { mobile, setView } = useDeviceView();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [open, setOpen] = useState(false);

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

  const signOut = async () => { await createClient().auth.signOut(); window.location.href = "/"; };

  if (!ready) return <span className="ml-auto" />;
  if (!email) return <Link href="/login" className={`ml-auto text-sm hover:text-white ${mobile ? "border border-white/20 px-3 py-2 text-white/80" : "text-white/50"}`}>Sign in</Link>;

  if (mobile) return (
    <div className="relative ml-auto">
      {open && <button aria-hidden tabIndex={-1} onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default" />}
      <button onClick={() => setOpen(!open)} aria-label="Account menu" aria-expanded={open}
        className="relative z-50 flex h-10 w-10 items-center justify-center border border-white/20 text-lg text-white/80">☰</button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 space-y-3 border border-white/20 bg-black p-4 text-white shadow-xl">
          <div className="truncate text-xs text-white/50">{email}</div>
          {admin && <div className="flex items-start gap-3"><IngestButton /><AddSource /></div>}
          <button onClick={() => { setOpen(false); setView("desktop"); }} className="w-full border border-white/20 py-2.5 text-xs uppercase tracking-widest text-white/70">Desktop site</button>
          <button onClick={signOut} className="w-full border border-white/20 py-2.5 text-xs uppercase tracking-widest text-white/70">Sign out</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="ml-auto flex items-center gap-4 text-sm text-white/50">
      {admin && <><IngestButton /><AddSource /></>}
      <span className="hidden max-w-[14rem] truncate sm:inline">{email}</span>
      <button onClick={signOut} className="hover:text-white">Sign out</button>
    </div>
  );
}
