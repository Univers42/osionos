// Decides whether a marketplace app can be opened from THIS origin, and at which URL.
// The catalogue is server data (seed-marketplace.mjs), one seed for every clone, so its
// launch URLs are the dev ones (https://localhost:3002 …). The build's VITE_*_APP_URL is
// the deployment's own answer and wins: before, the localhost catalogue URL was checked
// even when the public build named Mail's public origin, so a public site could never
// list Mail or Calendar (baas, 2026-10-22). A loopback URL shown on a public origin would
// open the visitor's own machine, so such an entry is unlaunchable and hidden.

import { isNativeApp } from "./installedAppLauncher";
import { configuredUrlFor, currentPageHostname, currentPageOrigin, isReachableUrl } from "@/shared/config/appUrls";
import { isSameOrigin } from "@/shared/lib/embed/embedUrlGuard";

/** `configured`: "" = the build opted the app out, null = no gate (catalogue URL used).
 *  An app on this page's own origin is refused too: osionos refuses to be framed
 *  (frame-ancestors 'none'), and a same-origin pane would void the embed sandbox. */
export function launchUrlFor(identifier: string, catalogueUrl: string, configured: string | null, pageHostname: string, pageOrigin = ""): string {
  if (isNativeApp(identifier)) return catalogueUrl;
  if (configured === "") return "";
  const url = configured ?? catalogueUrl;
  if (isSameOrigin(url, pageOrigin)) return "";
  return isReachableUrl(url, pageHostname) ? url : "";
}

/** An app with no launch URL anywhere (pure listing) stays visible; any other app is
 *  listed exactly when it can be launched here. */
export function listableFor(identifier: string, catalogueUrl: string, configured: string | null, pageHostname: string, pageOrigin = ""): boolean {
  if (isNativeApp(identifier)) return true;
  if (configured === null && catalogueUrl.trim() === "") return true;
  return launchUrlFor(identifier, catalogueUrl, configured, pageHostname, pageOrigin) !== "";
}

/** The launch URL to use, or "" when the app cannot open here. Checked here, not in the
 *  seed, so installs already stored in user databases are covered too. */
export function effectiveLaunchUrl(identifier: string, launchUrl: string, pageHostname = currentPageHostname(), pageOrigin = currentPageOrigin()): string {
  return launchUrlFor(identifier, launchUrl, configuredUrlFor(identifier), pageHostname, pageOrigin);
}

export function isListableApp(identifier: string, launchUrl: string, pageHostname = currentPageHostname(), pageOrigin = currentPageOrigin()): boolean {
  return listableFor(identifier, launchUrl, configuredUrlFor(identifier), pageHostname, pageOrigin);
}
