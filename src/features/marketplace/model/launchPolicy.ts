// Decides whether a marketplace app can be opened from THIS origin. The catalogue
// is server data (seed-marketplace.mjs) and carries dev launch URLs such as
// https://localhost:3001; shown on a public origin they would open the visitor's
// own machine, so such entries are treated as unlaunchable and hidden.

import { isNativeApp } from "./installedAppLauncher";
import { configuredUrlFor, currentPageHostname, isReachableUrl } from "@/shared/config/appUrls";

/** The launch URL to use, or "" when the app cannot open here. A surface whose
 *  VITE_* URL is blank is unlaunchable regardless of what the catalogue says. */
export function effectiveLaunchUrl(identifier: string, launchUrl: string, pageHostname = currentPageHostname()): string {
  if (isNativeApp(identifier)) return launchUrl;
  if (configuredUrlFor(identifier) === "") return "";
  return isReachableUrl(launchUrl, pageHostname) ? launchUrl : "";
}

/** An app with no launch URL at all (pure listing) stays visible; one that HAS a
 *  launch URL which cannot work here is hidden. */
export function isListableApp(identifier: string, launchUrl: string, pageHostname = currentPageHostname()): boolean {
  if (isNativeApp(identifier)) return true;
  return launchUrl.trim() === "" ? configuredUrlFor(identifier) !== "" : effectiveLaunchUrl(identifier, launchUrl, pageHostname) !== "";
}
