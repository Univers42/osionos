/**
 * The Privacy Policy and Terms of Service, which the subject (III.2) requires to be reachable
 * from the app. The pages live on the public site (opposite-osiris `src/pages/legal/`), so the
 * links are built from that site's origin rather than served here.
 */

import { safeHttpUrl } from "@/shared/lib/embed/embedUrlGuard";

export interface LegalLink {
  id: "privacy" | "terms";
  label: string;
  href: string;
}

const PAGES: ReadonlyArray<Omit<LegalLink, "href"> & { path: string }> = [
  { id: "privacy", label: "Privacy Policy", path: "legal/privacy-policy/" },
  { id: "terms", label: "Terms of Service", path: "legal/terms/" },
];

/** The legal pages under `siteOrigin`; none when it is not an absolute http(s) URL. */
export function legalLinks(siteOrigin: string): LegalLink[] {
  const base = safeHttpUrl(siteOrigin);
  if (base === "") return [];
  const root = base.endsWith("/") ? base : `${base}/`;
  return PAGES.map(({ path, ...page }) => ({ ...page, href: new URL(path, root).href }));
}
