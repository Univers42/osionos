/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embedKit.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The provider result type and the builders every provider family shares, so
 * the shape of an embed (kind, aspect, fixed height) is decided in one place.
 */

export type ProviderEmbedKind = "video" | "audio" | "rich";

export interface ProviderEmbed {
  provider: string;
  kind: ProviderEmbedKind;
  /** The player URL as stored. Twitch carries no `parent` here: add it at
   *  render with `playerSrcForHost`. */
  src: string;
  /** `"w/h"`, always inside the range `safeAspect` accepts. */
  aspect: string;
  thumb?: string;
  /** Fixed pixel height for players that are a strip (audio widgets). */
  height?: number;
  /** `false` when the provider is known to refuse framing, so the UI shows a
   *  card instead of an empty box. Absent means framing is expected to work. */
  frameable?: boolean;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Intrinsic width/height as a reduced `"w/h"`. A strip wider than 4:1 (or
 *  taller than 1:4) is pinned to the limit `safeAspect` accepts; the fixed
 *  `height` of such embeds is what the UI should honour. */
export function aspectOf(width: number, height: number): string {
  const ratio = width / height;
  if (ratio > 4) return "4/1";
  if (ratio < 0.25) return "1/4";
  const divisor = gcd(width, height);
  return `${width / divisor}/${height / divisor}`;
}

export function video(provider: string, src: string, width = 560, height = 315): ProviderEmbed {
  return { provider, kind: "video", src, aspect: aspectOf(width, height) };
}

export function page(provider: string, src: string, width = 560, height = 840): ProviderEmbed {
  return { provider, kind: "rich", src, aspect: aspectOf(width, height) };
}

export function audio(provider: string, src: string, width: number, height: number): ProviderEmbed {
  return { provider, kind: "audio", src, aspect: aspectOf(width, height), height };
}
