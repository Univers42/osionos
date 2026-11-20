/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   imageSource.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// THE one parser for "may this string be drawn as an image" (ADR 0069 BG3): the
// profile banner/avatar policy and the stricter block-background policy both
// read a kind from classifyImageSource instead of keeping a regex of their own.
// scripts/bridge-image-source.mjs is a plain-node copy of this file (the bridge
// cannot import TypeScript); tests/canvas/image-source-drift.test.ts fails when
// the two differ. Change both together.

/** Where the app and the bridge answer, e.g. "https://a.example"; bridge may be "". */
export interface ImageOrigins {
  app: string;
  bridge: string;
}

/** What a raw source string is: https, app-relative, or the bridge's own media. */
export type ImageSourceKind = "https" | "same-origin" | "bridge-media";

/** A source longer than this is hostile noise, not a URL a person pasted. */
export const MAX_IMAGE_SOURCE_LENGTH = 2048;

/** Video extensions, copied from VIDEO_EXT_RE in src/entities/page/ui/coverMedia.ts. */
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogv)$/i;

/** Pathnames the bridge answers uploads under, before bridgeMediaUrl prefixes them. */
const UPLOADS_PREFIX = "/api/media/uploads/";

/** No app or bridge known: relative values match only the shape rule. */
const NO_ORIGINS: ImageOrigins = { app: "", bridge: "" };

/**
 * A "\", a C0 control or DEL never appears in a URL the way a person reads it:
 * a browser folds "\" into "/" and strips TAB/LF/CR, which turned "/\<host>/p.png"
 * and "/<TAB>/<host>/p.png" into off-site requests. Refused before any parsing.
 */
function hasHostileChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f || value[i] === "\\") return true;
  }
  return false;
}

/** The parse behind every rule, against the app origin. Without one (not in a
 *  browser) relative values parse against a placeholder whose origin matches
 *  no rule, and the same-origin rule below trusts the raw shape alone. */
function parseImageSource(value: string, origins: ImageOrigins): URL | null {
  const base = origins.app !== "" ? origins.app : "https://image-source.invalid";
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

/** A root-relative path ("/img/a.png", never a "//host/…" one): same-origin
 *  wherever the app is served — checked against origins.app when there is one. */
function isSameOriginPath(value: string, origins: ImageOrigins, parsed: URL | null): boolean {
  if (!value.startsWith("/") || value[1] === "/") return false;
  return origins.app === "" || (parsed !== null && parsed.origin === origins.app);
}

/** The configured bridge's own media, whatever its scheme (a local or test
 *  bridge answers on http), under /api/media/ of the bridge itself. */
function isBridgeMedia(value: string, origins: ImageOrigins, parsed: URL): boolean {
  if (origins.bridge === "" || !value.startsWith(`${origins.bridge}/api/media/`)) return false;
  try {
    return new URL(origins.bridge).origin === parsed.origin && parsed.pathname.startsWith("/api/media/");
  } catch {
    return false;
  }
}

/**
 * What a raw source string is, or null when it may not be drawn at all: not a
 * string of a sane length, hostile characters, unparseable, credentials
 * embedded, a scheme other than https ("http:", "data:", "blob:",
 * "javascript:", "//host"), or a path off neither the app nor the bridge.
 */
export function classifyImageSource(value: unknown, origins: ImageOrigins = NO_ORIGINS): ImageSourceKind | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_IMAGE_SOURCE_LENGTH) return null;
  if (hasHostileChar(value)) return null;
  const parsed = parseImageSource(value, origins);
  if (parsed === null || parsed.username !== "" || parsed.password !== "") return null;
  if (value.slice(0, 8).toLowerCase() === "https://") return parsed.protocol === "https:" ? "https" : null;
  if (isSameOriginPath(value, origins, parsed)) return "same-origin";
  if (isBridgeMedia(value, origins, parsed)) return "bridge-media";
  return null;
}

/** Profile banner/avatar policy: any kind above. */
export function isProfileImageSource(value: unknown, origins: ImageOrigins = NO_ORIGINS): value is string {
  return classifyImageSource(value, origins) !== null;
}

/** An upload as the browser will fetch it: dot segments ("..", "%2e%2e")
 *  resolved, so an owner check on the result checks the upload actually read. */
function resolvedUpload(kind: ImageSourceKind, parsed: URL): string | null {
  if (!parsed.pathname.startsWith(UPLOADS_PREFIX)) return null;
  const path = `${parsed.pathname}${parsed.search}`;
  const resolved = kind === "bridge-media" ? `${parsed.origin}${path}` : path;
  return resolved.length > MAX_IMAGE_SOURCE_LENGTH ? null : resolved;
}

/**
 * Block background policy (BG3): "https" as given, or a "bridge-media"/
 * "same-origin" upload under /api/media/uploads/ (the bridge answers uploads as
 * a path relative to itself before bridgeMediaUrl prefixes it), returned
 * resolved. A source naming a video is never a backdrop.
 */
export function sanitizeBackdropSource(value: unknown, origins: ImageOrigins = NO_ORIGINS): string | null {
  if (typeof value !== "string") return null;
  const kind = classifyImageSource(value, origins);
  if (kind === null) return null;
  const parsed = parseImageSource(value, origins);
  if (parsed === null || VIDEO_EXT_RE.test(parsed.pathname)) return null;
  return kind === "https" ? value : resolvedUpload(kind, parsed);
}
