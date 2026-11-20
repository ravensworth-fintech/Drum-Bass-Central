import { cookies, headers } from "next/headers";

export type SiteView = "mobile" | "desktop";

/** Server-side: the person's saved choice (cookie "site-view") wins; otherwise guess from the request so a phone gets the mobile layout on first paint. */
export function getDeviceInfo(): { mobile: boolean; override: SiteView | null } {
  const c = cookies().get("site-view")?.value;
  const override: SiteView | null = c === "desktop" || c === "mobile" ? c : null;
  if (override) return { mobile: override === "mobile", override };
  const h = headers();
  const ua = h.get("user-agent") ?? "";
  const mobile = h.get("sec-ch-ua-mobile") === "?1" ||
    /Android.+Mobile|iPhone|iPod|Windows Phone|webOS|BlackBerry|IEMobile|Opera Mini|Mobile.+Firefox/i.test(ua);
  return { mobile, override: null };
}
