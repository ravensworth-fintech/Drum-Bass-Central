"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { authHeaders, useSession } from "@/lib/use-session";
import { useDeviceView } from "@/components/DeviceProvider";
import { IngestButton } from "@/components/IngestButton";
import { AddSource } from "@/components/AddSource";
import { PdfExport } from "@/components/PdfExport";
import { SourcesManager } from "@/components/SourcesManager";
import { ShareLikes } from "@/components/ShareLikes";
import { clearListCache } from "@/lib/list-cache";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border border-white/10 p-4 sm:p-5">
      <h2 className="text-xs font-bold uppercase tracking-widest text-white/60">{title}</h2>
      {hint && <p className="mt-1 text-xs text-white/40">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Number of Discover suggestions waiting for an Add / Skip decision (null while loading or if it can't be read). */
function usePendingCount(enabled: boolean): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/suggestions", { headers: await authHeaders(), cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (live && res.ok && json.ok) setN((json.suggestions as unknown[]).length);
      } catch { /* leave the count out */ }
    })();
    return () => { live = false; };
  }, [enabled]);
  return n;
}

/** Everything that used to sit under the Account menu, plus channel tools for admins. */
export default function DashboardClient() {
  const { ready, email, admin } = useSession();
  const { mobile, auto, setView } = useDeviceView();
  const pending = usePendingCount(admin);

  async function signOut() { await createClient().auth.signOut(); clearListCache(); window.location.href = "/"; }

  if (!ready) return <p className="text-sm text-white/50">Loading…</p>;
  if (!email) {
    return (
      <>
        <h1 className="mb-4 text-2xl font-black uppercase sm:text-3xl">Dashboard</h1>
        <p className="text-sm text-white/70">Sign in to see your dashboard.</p>
        <Link href="/login" className="mt-4 inline-block border border-[#c6ff00] px-4 py-2 text-xs font-bold uppercase tracking-widest text-[#c6ff00] hover:bg-[#c6ff00] hover:text-black">Sign in</Link>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black uppercase sm:text-3xl">Dashboard</h1>

      <Section title="Account">
        <p className="truncate text-sm text-white/80">{email}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(mobile || auto) && (
            <button onClick={() => setView(mobile ? "desktop" : "mobile")}
              className="border border-white/20 px-3 py-1.5 text-xs uppercase tracking-widest text-white/70 hover:border-white/50 hover:text-white">{mobile ? "Desktop site" : "Mobile site"}</button>
          )}
          <button onClick={signOut}
            className="border border-white/20 px-3 py-1.5 text-xs uppercase tracking-widest text-white/70 hover:border-white/50 hover:text-white">Sign out</button>
        </div>
      </Section>

      <Section title="Channels" hint="Every list on the site shows only the channels you follow. New uploads are scanned automatically every 2 hours.">
        <div className="space-y-4">
          {admin && (
            <div className="flex items-start gap-4">
              <IngestButton align="left" />
              <p className="pt-1.5 text-xs text-white/50">Scan every starter and followed channel for new tracks and mixes now.</p>
            </div>
          )}
          <div className="flex items-start gap-4">
            <AddSource align="left" />
            <p className="pt-1.5 text-xs text-white/50">
              Follow a YouTube channel or SoundCloud account.{" "}
              {admin ? "No limit for admins; channels you add also join the starter set that signed-out visitors see." : "You can add 15 new channels per 24 hours."}
            </p>
          </div>
        </div>
      </Section>

      <Section title="Your channels" hint="Removing a channel only removes it from your own lists. Nobody else is affected, and your likes stay.">
        <SourcesManager isAdmin={admin} />
      </Section>

      <Section title="Share your likes" hint="A read-only link to your Likes page. Viewers can play, select tracks and copy their links.">
        <ShareLikes />
      </Section>

      <Section title="Track list PDF" hint="Artist - Title for a whole list: the newest 1,000 tracks from your channels, or all of your likes.">
        <PdfExport />
      </Section>

      {admin && (
        <>
          <Section title="Discover" hint="Channels of artists credited on tracks you already have. Checked once a day.">
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/discover" className="border border-[#c6ff00] px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-[#c6ff00] hover:bg-[#c6ff00] hover:text-black">
                Review suggestions{pending ? ` (${pending})` : ""}
              </Link>
              {pending === 0 && <p className="text-xs text-white/50">Nothing waiting right now.</p>}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
