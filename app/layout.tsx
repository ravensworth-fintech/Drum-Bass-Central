import "./globals.css";
import Link from "next/link";
import { AuthNav } from "@/components/AuthNav";
export const metadata = { title: "D&B Discover" };
const nav = [["/", "Discover"], ["/tracks", "Tracks"], ["/liked", "Liked Tracks"]];
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body>
      <header className="flex items-center gap-6 border-b border-white/10 px-6 py-4">
        <span className="font-black uppercase tracking-widest text-[#c6ff00]">D&amp;B</span>
        {nav.map(([href, label]) => (
          <Link key={href} href={href} className="text-sm uppercase tracking-widest text-white/70 hover:text-white">{label}</Link>
        ))}
        <AuthNav />
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </body></html>
  );
}
