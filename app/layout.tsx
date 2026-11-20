import "./globals.css";
import type { Viewport } from "next";
import { PlayerProvider } from "@/components/PlayerProvider";
import { DeviceProvider } from "@/components/DeviceProvider";
import { AppShell } from "@/components/AppShell";
import { getDeviceInfo } from "@/lib/device";

export const metadata = { title: "DropTheFire" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0b0b0c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { mobile, override } = getDeviceInfo();
  return (
    <html lang="en"><body>
      <DeviceProvider initial={mobile} initialOverride={override}>
        <PlayerProvider>
          <AppShell>{children}</AppShell>
        </PlayerProvider>
      </DeviceProvider>
    </body></html>
  );
}
