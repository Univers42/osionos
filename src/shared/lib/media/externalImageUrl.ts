/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   externalImageUrl.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * THE one normalizer for user-pasted external media URLs — every surface that
 * accepts an image/video link (media embed dialog, page-cover picker, …)
 * resolves input through here; none may keep a private copy.
 *
 * Beyond scheme fixing, it unwraps SEARCH-ENGINE VIEWER pages: users copy
 * "the image's URL" from Google Images and get a google.com/imgres HTML page
 * whose real image hides in its `imgurl=` query param. Embedding the wrapper
 * can never render (the browser ORB-blocks an HTML document loaded as an
 * image), so the wrapper is unwrapped to the image it presents. Bing /
 * DuckDuckGo viewers and google.com/url redirects get the same treatment.
 */

/** Query param carrying the real target for a known viewer/redirect URL. */
function viewerTargetParam(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const isGoogle = /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host);
  if (isGoogle && url.pathname === "/imgres") return "imgurl";
  if (isGoogle && url.pathname === "/url") return "url";
  if (/(^|\.)bing\.[a-z]{2,3}$/.test(host) && url.pathname.startsWith("/images")) return "mediaurl";
  if (/(^|\.)duckduckgo\.com$/.test(host)) return "iu";
  return null;
}

/** Unwrap one viewer/redirect layer; null when `url` is not a known wrapper. */
function unwrapViewerUrl(url: URL): string | null {
  const param = viewerTargetParam(url);
  if (!param) return null;
  const target = url.searchParams.get(param);
  return target && target.trim() ? target.trim() : null;
}

/**
 * Normalize a user-pasted external URL: trim, upgrade bare domains to https,
 * accept http(s)/data:/blob:, and unwrap search-viewer pages (bounded, in
 * case a wrapper wraps another wrapper). Returns null for unusable input.
 */
export function normalizeExternalUrl(value: string): string | null {
  let candidate = value.trim();
  if (!candidate) return null;
  if (!/^(https?:|data:|blob:)/i.test(candidate)) {
    if (!/^[\w.-]+\.[a-z]{2,}/i.test(candidate)) return null;
    candidate = `https://${candidate}`;
  }
  for (let hop = 0; hop < 3; hop += 1) {
    if (!/^https?:/i.test(candidate)) break;
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      return null;
    }
    const inner = unwrapViewerUrl(parsed);
    if (!inner) break;
    candidate = /^(https?:|data:|blob:)/i.test(inner) ? inner : `https://${inner}`;
  }
  return candidate;
}
