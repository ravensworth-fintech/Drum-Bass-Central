"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type SiteView = "mobile" | "desktop";
type Ctx = { mobile: boolean; auto: boolean; override: SiteView | null; setView: (v: SiteView | null) => void };
const DeviceCtx = createContext<Ctx>({ mobile: false, auto: false, override: null, setView: () => {} });

/** true when the site should show its mobile version. */
export const useIsMobile = () => useContext(DeviceCtx).mobile;
/** For the "Desktop site / Mobile site" switch. `auto` is what the screen itself calls for; `override` is the person's saved choice (or null). */
export const useDeviceView = () => useContext(DeviceCtx);

// Phones, plus any narrow window. Touch tablets in landscape keep the desktop layout.
const QUERY = "(max-width: 767px), (pointer: coarse) and (max-width: 1023px)";

/** `initial` / `initialOverride` come from the server (cookie + User-Agent). After load the browser's real screen size takes over unless the person chose a view. */
export function DeviceProvider({ initial, initialOverride, children }: { initial: boolean; initialOverride: SiteView | null; children: React.ReactNode }) {
  const [auto, setAuto] = useState(initial);
  const [override, setOverride] = useState<SiteView | null>(initialOverride);
  useEffect(() => {
    const m = window.matchMedia(QUERY);
    const sync = () => setAuto(m.matches);
    sync();
    m.addEventListener("change", sync);
    return () => m.removeEventListener("change", sync);
  }, []);
  const setView = useCallback((v: SiteView | null) => {
    setOverride(v);
    document.cookie = v ? `site-view=${v}; path=/; max-age=31536000; SameSite=Lax` : "site-view=; path=/; max-age=0; SameSite=Lax";
    window.scrollTo(0, 0);
  }, []);
  const value = useMemo(() => ({ mobile: override ? override === "mobile" : auto, auto, override, setView }), [auto, override, setView]);
  return <DeviceCtx.Provider value={value}>{children}</DeviceCtx.Provider>;
}
