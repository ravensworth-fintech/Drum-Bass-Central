"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthNav } from "@/components/AuthNav";
import { useDeviceView } from "@/components/DeviceProvider";

const nav = [["/", "Fresh Fire"], ["/dnb", "D&B"], ["/house", "House"], ["/dubstep", "Dubstep"], ["/bands", "Bands"], ["/mixes", "Mixes"], ["/liked", "Likes"]];
/** Likes gets a heart in front of its name. */
const labelOf = (href: string, label: string) => (href === "/liked" ? <><span aria-hidden className="mr-1">♥</span>{label}</> : label);

/** Desktop: top bar with links. Mobile: slim top bar + tab bar fixed to the bottom of the screen (thumb reach).
 *  Header and main stay in the same place in both modes, so the page (and the player) is not reloaded when the layout switches. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { mobile, auto, setView } = useDeviceView();
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      <header className={mobile
        ? "sticky top-0 z-40 flex items-center border-b border-white/10 bg-[#0b0b0c] px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]"
        : "flex items-center gap-6 border-b border-white/10 px-6 py-4"}>
        <Link href="/" className="font-black uppercase tracking-widest text-[#c6ff00]">DropTheFire</Link>
        {!mobile && nav.map(([href, label]) => (
          <Link key={href} href={href} className="text-sm uppercase tracking-widest text-white/70 hover:text-white">{labelOf(href, label)}</Link>
        ))}
        <AuthNav />
      </header>
      <main className={mobile ? "px-4 py-4 pb-24" : "mx-auto max-w-5xl px-6 py-8"}>{children}
        {/* The switch: phones can go to the desktop site; if they did, a link here brings the mobile site back. */}
        {(mobile || auto) && (
          <div className="mt-10 text-center">
            <button onClick={() => setView(mobile ? "desktop" : "mobile")} className="text-xs uppercase tracking-widest text-white/40 underline hover:text-white">
              {mobile ? "View desktop site" : "Back to mobile site"}
            </button>
          </div>
        )}
      </main>
      {mobile && (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-7 border-t border-white/10 bg-[#0b0b0c] pb-[env(safe-area-inset-bottom)]">
          {nav.map(([href, label]) => (
            <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
              className={`flex h-14 items-center justify-center border-t-2 px-0.5 text-center text-[10px] font-bold uppercase leading-tight tracking-wide ${active(href) ? "border-[#c6ff00] text-[#c6ff00]" : "border-transparent text-white/60"}`}>
              <span>{labelOf(href, label)}</span>
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
