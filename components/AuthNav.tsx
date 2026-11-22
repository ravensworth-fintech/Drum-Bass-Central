"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDeviceView } from "@/components/DeviceProvider";
import { useSession } from "@/lib/use-session";

/** Right side of the header: Likes (styled like the old INGEST button) and Dashboard (styled like the genre buttons).
 *  Account info, INGEST, ADD +, Discover, PDF and Sign out all live on the Dashboard page now. */
export function AuthNav() {
  const { mobile } = useDeviceView();
  const { ready, email } = useSession();
  const path = usePathname();
  const likesOn = path.startsWith("/liked");
  const dashOn = path.startsWith("/dashboard");
  const size = mobile ? "px-2.5 py-2 text-[11px] tracking-wider" : "px-3 py-1.5 text-xs tracking-widest";
  return (
    <div className="ml-auto flex items-center gap-2">
      <Link href="/liked" aria-current={likesOn ? "page" : undefined}
        className={`border border-[#c6ff00] font-bold uppercase ${size} ${likesOn ? "bg-[#c6ff00] text-black" : "text-[#c6ff00] hover:bg-[#c6ff00] hover:text-black"}`}>
        <span aria-hidden className="mr-1">♥</span>Likes
      </Link>
      {!ready ? null : email ? (
        <Link href="/dashboard" aria-current={dashOn ? "page" : undefined}
          className={`border font-bold uppercase ${size} ${dashOn ? "border-[#c6ff00] bg-[#c6ff00] text-black" : "border-white/20 text-white/70 hover:text-white"}`}>
          Dashboard
        </Link>
      ) : (
        <Link href="/login" className={`ml-1 text-sm hover:text-white ${mobile ? "border border-white/20 px-3 py-2 text-white/80" : "text-white/50"}`}>Sign in</Link>
      )}
    </div>
  );
}
