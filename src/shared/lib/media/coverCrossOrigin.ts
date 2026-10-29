/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   coverCrossOrigin.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Pixabay's CDN answers `Access-Control-Allow-Origin: *` and sets a Cloudflare
// `__cf_bm` cookie, which browsers now flag as a foreign unpartitioned cookie.
// An anonymous CORS fetch carries no credentials and stores no cookie. Only for
// hosts known to send that header: elsewhere it would block the media outright.
const CREDENTIALLESS_HOSTS = new Set(["cdn.pixabay.com"]);

/** `crossOrigin` for a cover media element: "anonymous" for provider CDNs that
 *  allow it, so they cannot set cookies; undefined (a plain fetch) otherwise. */
export function coverCrossOrigin(src: string | undefined): "anonymous" | undefined {
  if (!src) return undefined;
  try {
    return CREDENTIALLESS_HOSTS.has(new URL(src).hostname) ? "anonymous" : undefined;
  } catch {
    return undefined;
  }
}
