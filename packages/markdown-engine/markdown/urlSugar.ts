/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   urlSugar.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Shared URL sugar: derive a compact anchor label for a bare URL, and detect a
// paste that is a single bare URL. Used by the inline autolink matcher and the
// editor paste handler so both agree on "bare URL -> [hostname](url)".

/** Human-friendly anchor text for a bare URL: its hostname, or "Link" as a fallback. */
export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname || "Link";
  } catch {
    const match = /^https?:\/\/([^/?#\s]+)/i.exec(url);
    return match?.[1] ?? "Link";
  }
}

/** True when `text` (trimmed) is exactly one bare http(s) URL with no whitespace. */
export function isSingleBareUrl(text: string): boolean {
  const trimmed = text.trim();
  return /^https?:\/\/\S+$/i.test(trimmed) && !/\s/.test(trimmed);
}

/** Bracket link source for a bare URL: `[hostname](url)`. */
export function bareUrlToLinkSource(url: string): string {
  const trimmed = url.trim();
  return `[${hostnameFromUrl(trimmed)}](${trimmed})`;
}
