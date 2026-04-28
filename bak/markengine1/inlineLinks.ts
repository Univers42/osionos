/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineLinks.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/16 22:23:55 by rstancu           #+#    #+#             */
/*   Updated: 2026/04/16 22:23:56 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Normalizes inline link targets produced by editor UI inputs.
 * Bare domains become `https://...`, protocol-relative URLs become
 * explicit HTTPS, and already-qualified or custom-scheme URLs are preserved.
 */
export function normalizeInlineLinkHref(href: string) {
  const cleanHref = href.trim();
  if (!cleanHref) {
    return cleanHref;
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(cleanHref) || cleanHref.startsWith("//")) {
    return cleanHref.startsWith("//") ? `https:${cleanHref}` : cleanHref;
  }

  if (
    /^[^\s/]+\.[^\s/]+(?:[/?#].*)?$/i.test(cleanHref) &&
    !cleanHref.startsWith("/") &&
    !cleanHref.startsWith("#")
  ) {
    return `https://${cleanHref}`;
  }

  return cleanHref;
}
