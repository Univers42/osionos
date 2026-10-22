/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embedUrlParts.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Structural URL parsing for the provider rules, ported from drawnosaurus
 * `scene/embed.rs`. Parsed by hand instead of `new URL` so a pasted
 * `youtu.be/abc` (no scheme) works and so each rule asks explicit questions
 * about host, path and query instead of matching a regex against the whole link.
 *
 * Caveat: values are never percent-decoded, so an id containing `%2F` is
 * refused by `isId` rather than decoded; IDN hosts never match the allow-list
 * (the miss is a null, never a wrong embed); an HTML snippet is only searched
 * for its first `href`/`src` attribute, not parsed.
 */

/** Hosts that may be embedded at all (embed.rs ALLOWED_EMBED_HOSTS). An
 *  allow-list: being on it is necessary, each provider must also recognise
 *  the link. */
export const ALLOWED_EMBED_HOSTS: readonly string[] = [
  "youtube.com", "youtu.be", "youtube-nocookie.com", "vimeo.com", "player.vimeo.com",
  "drive.google.com", "docs.google.com", "calendar.google.com", "google.com", "figma.com",
  "link.excalidraw.com", "excalidraw.com", "gist.github.com", "twitter.com", "x.com",
  "simplepdf.eu", "stackblitz.com", "val.town", "giphy.com", "reddit.com",
  "forms.microsoft.com", "forms.office.com", "loom.com", "open.spotify.com", "soundcloud.com",
  "dailymotion.com", "dai.ly", "tiktok.com", "streamable.com", "twitch.tv",
  "facebook.com", "fb.watch", "instagram.com", "bilibili.com", "codepen.io",
  "codesandbox.io", "jsfiddle.net", "openstreetmap.org", "podcasts.apple.com", "music.apple.com",
  "mixcloud.com", "ted.com", "desmos.com", "miro.com",
];

export interface UrlParts {
  /** Without `www.`, `m.` or `mobile.`: what the rules match on. */
  host: string;
  /** As written (lowercased), for a link that is framed as it stands. */
  writtenHost: string;
  path: string;
  query: string;
  segments: string[];
}

const HOST_CHARS = /^[a-z0-9.-]+$/;

function stripPrefixes(host: string): string {
  return host.replace(/^(?:www\.)+/, "").replace(/^(?:m\.)+/, "").replace(/^(?:mobile\.)+/, "");
}

function afterScheme(text: string): string | null {
  const index = text.indexOf("://");
  if (index >= 0) {
    const scheme = text.slice(0, index).toLowerCase();
    return scheme === "http" || scheme === "https" ? text.slice(index + 3) : null;
  }
  const colon = text.indexOf(":");
  if (colon >= 0) {
    const before = text.slice(0, colon);
    // `javascript:x` and `mailto:x` are not bare hosts; `host:8080` has digits.
    if (!before.includes("/") && !/^\d*$/.test(before)) return null;
  }
  return text;
}

/** Split a URL, tolerating a missing scheme and a leading `www.`. */
export function splitUrl(raw: string): UrlParts | null {
  const trimmed = raw.trim();
  const hash = trimmed.indexOf("#");
  const text = hash >= 0 ? trimmed.slice(0, hash) : trimmed;
  const rest0 = text === "" ? null : afterScheme(text);
  if (rest0 === null) return null;
  const end = rest0.search(/[/?]/);
  const authority = end >= 0 ? rest0.slice(0, end) : rest0;
  const rest = end >= 0 ? rest0.slice(end) : "";
  const hostPort = authority.slice(authority.lastIndexOf("@") + 1);
  const colon = hostPort.indexOf(":");
  const writtenHost = (colon >= 0 ? hostPort.slice(0, colon) : hostPort).toLowerCase();
  const host = stripPrefixes(writtenHost);
  if (host === "" || !HOST_CHARS.test(writtenHost)) return null;
  const question = rest.indexOf("?");
  const path = question >= 0 ? rest.slice(0, question) : rest;
  const query = question >= 0 ? rest.slice(question + 1) : "";
  return { host, writtenHost, path, query, segments: path.split("/").filter((s) => s !== "") };
}

/** The allow-listed domain a host belongs to, matched on a dot boundary so
 *  `notyoutube.com` does not slip past `youtube.com`. */
export function providerHostOf(host: string): string | null {
  const lower = host.toLowerCase();
  return ALLOWED_EMBED_HOSTS.find((allowed) => lower === allowed || lower.endsWith(`.${allowed}`)) ?? null;
}

/** First value of `key` in a raw query string (not decoded). */
export function queryValue(query: string, key: string): string | undefined {
  for (const pair of query.split("&")) {
    const eq = pair.indexOf("=");
    if (eq > 0 && pair.slice(0, eq) === key) return pair.slice(eq + 1);
  }
  return undefined;
}

/** `https://host/path?query`, as written. */
export function asGiven(parts: UrlParts): string {
  return `https://${parts.writtenHost}${parts.path}${parts.query === "" ? "" : `?${parts.query}`}`;
}

/** An id taken from a pasted link and put into a URL on someone else's domain:
 *  anything outside `[A-Za-z0-9_-]{1,200}` (a `/`, `?`, `%2F`) is refused. */
export function isId(value: string | undefined): value is string {
  return value !== undefined && /^[A-Za-z0-9_-]{1,200}$/.test(value);
}

/** As `isId`, also allowing the dots of a dotted name (`user.val`, `@user`). */
export function isName(value: string | undefined): value is string {
  return value !== undefined && /^[A-Za-z0-9_.@-]{1,200}$/.test(value) && !value.includes("..");
}

export function isDigits(value: string | undefined): value is string {
  return value !== undefined && /^\d{1,30}$/.test(value);
}

const MAX_SECONDS = 2_147_483_647;
const UNIT_SECONDS: Record<string, number> = { h: 3600, m: 60, s: 1 };

/** Seconds into a video from `t` or `start`: a plain count or `1h2m3s`. 0 when
 *  absent or not understood (guessing would start the video somewhere arbitrary). */
export function parseTimestamp(query: string): number {
  const raw = queryValue(query, "t") ?? queryValue(query, "start");
  if (raw === undefined) return 0;
  if (/^\d+$/.test(raw)) return Math.min(Number(raw), MAX_SECONDS);
  if (!/^(?:\d+[hms])+$/.test(raw)) return 0;
  let total = 0;
  for (const [, amount, unit] of raw.matchAll(/(\d+)([hms])/g)) {
    total += Number(amount) * (UNIT_SECONDS[unit] ?? 0);
  }
  return Math.min(total, MAX_SECONDS);
}

/** Percent-encode so a URL can ride inside another URL's query: only the
 *  unreserved set survives, or a `&` ends the parameter early. */
export function encodeComponent(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function attribute(html: string, lower: string, name: string): string | null {
  let from = 0;
  for (;;) {
    const found = lower.indexOf(name, from);
    if (found < 0) return null;
    const start = found + name.length;
    const quote = html.charAt(start);
    if (quote === '"' || quote === "'") {
      const close = html.indexOf(quote, start + 1);
      return close < 0 ? null : html.slice(start + 1, close).replace(/&amp;/g, "&");
    }
    from = start;
  }
}

/** The link inside an `<iframe>`, `<blockquote>` or `<script src>` snippet a
 *  provider hands out, or the input unchanged. A snippet is never trusted
 *  further than the link in it, which is resolved like any other. */
export function embedSrcOf(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("<")) return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("<blockquote")) return attribute(trimmed, lower, " href=") ?? trimmed;
  if (lower.startsWith("<script")) {
    const src = attribute(trimmed, lower, " src=");
    return src === null ? trimmed : src.replace(/\.js$/, "");
  }
  return attribute(trimmed, lower, " src=") ?? trimmed;
}
