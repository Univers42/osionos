/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embedUrlGuard.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Render-time guards for every URL that reaches an `href`, `src` or `<img>`
 * from a link block. Block JSON can be written by any collaborator, so a URL
 * stored on a block is untrusted each time it is shown. Pure and
 * browser-free apart from `appForbiddenOrigins`, which reads the environment.
 *
 * Not the first-party pane gate: `widgets/embed-app/model/embeddableUrl.ts`
 * frames our own apps as given and stays separate on purpose.
 */

const MAX_URL_LENGTH = 2048;
const HTTP_PREFIX = /^https?:\/\//i;

/** The normalized absolute http(s) URL, or "" when it must not be used. Refuses
 *  every other scheme, `user:pass@` userinfo, relative and protocol-relative
 *  forms, and anything over 2048 characters. */
export function safeHttpUrl(raw: string): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) return "";
  if (!HTTP_PREFIX.test(trimmed)) return "";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "";
  }
  if (url.username !== "" || url.password !== "" || url.hostname === "") return "";
  return url.href.length > MAX_URL_LENGTH ? "" : url.href;
}

function originOf(href: string): string {
  try {
    return new URL(href).origin;
  } catch {
    return "";
  }
}

/** `safeHttpUrl`, and not on any origin in `forbiddenOrigins`. A frame on the
 *  app's own origin runs with `allow-same-origin` and would void the sandbox. */
export function frameableEmbedUrl(raw: string, forbiddenOrigins: readonly string[]): string {
  const href = safeHttpUrl(raw);
  if (href === "") return "";
  const origin = originOf(href);
  const forbidden = forbiddenOrigins.map(originOf).filter((entry) => entry !== "");
  return forbidden.includes(origin) ? "" : href;
}

type ViteMeta = { env?: Record<string, string | boolean | undefined> };

/** The page's own origin plus the API and BaaS origins when configured.
 *  Caveat: only origins known at build/run time; a second hostname that proxies
 *  to the same backend is not recognised. Empty list outside a browser. */
export function appForbiddenOrigins(): string[] {
  const env = (import.meta as ViteMeta).env ?? {};
  const candidates: unknown[] = [
    (globalThis as { location?: { origin?: unknown } }).location?.origin,
    env["VITE_API_URL"],
    env["VITE_BAAS_URL"],
  ];
  const origins = candidates
    .filter((value): value is string => typeof value === "string")
    .map((value) => originOf(value.trim()))
    .filter((origin) => origin.startsWith("http"));
  return [...new Set(origins)];
}

/** The ASCII (punycode) hostname of the URL actually framed, `www.` stripped,
 *  so a lookalike cannot hide behind unicode in the footer. "" when unusable. */
export function displayHost(url: string): string {
  const href = safeHttpUrl(url);
  if (href === "") return "";
  return new URL(href).hostname.replace(/^www\./, "");
}
