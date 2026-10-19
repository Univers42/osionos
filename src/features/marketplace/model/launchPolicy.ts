// Decides whether a marketplace app can be opened from THIS origin. The catalogue
// is server data (seed-marketplace.mjs) and carries dev launch URLs such as
// https://localhost:3001; shown on a public origin they would open the visitor's
// own machine, so such entries are treated as unlaunchable and hidden.

import { isNativeApp } from "./installedAppLauncher";
import { configuredUrlFor, currentPageHostname, currentPageOrigin, isReachableUrl } from "@/shared/config/appUrls";
import { isSameOrigin } from "@/shared/lib/embed/embedUrlGuard";

/** The launch URL to use, or "" when the app cannot open here. A surface whose
 *  VITE_* URL is blank is unlaunchable regardless of what the catalogue says, and so is
 *  one on this page's own origin: the app refuses to be framed (frame-ancestors 'none'),
 *  and a same-origin pane would void the embed sandbox. Checked here, not in the seed,
 *  so installs already stored in user databases are covered too. */
export function effectiveLaunchUrl(
  identifier: string,
  launchUrl: string,
  pageHostname = currentPageHostname(),
  pageOrigin = currentPageOrigin(),
): string {
  if (isNativeApp(identifier)) return launchUrl;
  if (isSameOrigin(launchUrl, pageOrigin)) return "";
  if (configuredUrlFor(identifier) === "") return "";
  return isReachableUrl(launchUrl, pageHostname) ? launchUrl : "";
}

/** An app with no launch URL at all (pure listing) stays visible; one that HAS a
 *  launch URL which cannot work here is hidden. */
export function isListableApp(
  identifier: string,
  launchUrl: string,
  pageHostname = currentPageHostname(),
  pageOrigin = currentPageOrigin(),
): boolean {
  if (isNativeApp(identifier)) return true;
  return launchUrl.trim() === "" ? configuredUrlFor(identifier) !== "" : effectiveLaunchUrl(identifier, launchUrl, pageHostname, pageOrigin) !== "";
}
