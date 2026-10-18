// Where each embedded sibling app lives, and whether a visitor can reach it.
// The localhost fallbacks exist only for `vite` dev: they sit behind
// `import.meta.env.DEV`, which Vite folds to `false` in a production build so no
// loopback literal ships to an internet visitor (it would open THEIR machine).

type ViteMeta = { env?: Record<string, string | boolean | undefined> };
const VITE_ENV = (import.meta as ViteMeta).env ?? {};
// Optional-chained because node tests have no env object; Vite still folds it to
// `false` in a build (checked by grepping the production bundle for loopback literals).
export const IS_DEV = (import.meta as ViteMeta).env?.DEV === true;

/** A configured value wins, even when empty (empty = the build opted this surface
 *  out); only an ABSENT variable falls back. */
export function resolveAppUrl(configured: string | undefined, devFallback: string): string {
  return (configured ?? devFallback).trim();
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

/** True when `url` can load for a visitor on `pageHostname`: non-empty, and not a
 *  loopback target viewed from a non-loopback page. Relative URLs are same-origin.
 *  Caveat: only literal loopback names are recognised; a LAN or private-range
 *  address (192.168.x.x) on a public page is not flagged. */
export function isReachableUrl(url: string, pageHostname: string): boolean {
  const target = url.trim();
  if (target === "") return false;
  let host: string;
  try {
    host = new URL(target).hostname;
  } catch {
    return true;
  }
  return !isLoopbackHost(host) || pageHostname === "" || isLoopbackHost(pageHostname);
}

/** An unset page hostname (node tests, SSR) never hides anything on loopback grounds. */
export function currentPageHostname(): string {
  return globalThis.location?.hostname ?? "";
}

const MAIL_URL = resolveAppUrl(VITE_ENV["VITE_MAIL_APP_URL"] as string | undefined, IS_DEV ? "http://localhost:3002" : "");
const CALENDAR_URL = resolveAppUrl(VITE_ENV["VITE_CALENDAR_APP_URL"] as string | undefined, IS_DEV ? "http://localhost:3003" : "");
const WHITEBOARD_URL = resolveAppUrl(VITE_ENV["VITE_WHITEBOARD_APP_URL"] as string | undefined, IS_DEV ? "https://localhost:3007" : "");

export const mailAppUrl = (): string => MAIL_URL;
export const calendarAppUrl = (): string => CALENDAR_URL;
export const whiteboardAppUrl = (): string => WHITEBOARD_URL;

/** The URL an app-specific surface is gated on; unknown identifiers have no gate. */
export function configuredUrlFor(identifier: string): string | null {
  if (identifier === "osionos.mail") return MAIL_URL;
  if (identifier === "osionos.calendar") return CALENDAR_URL;
  if (identifier === "osionos.whiteboard") return WHITEBOARD_URL;
  return null;
}
