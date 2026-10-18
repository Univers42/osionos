/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embedPolicy.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The iframe policy for third-party embeds, as constants a test pins. Every
 * frame of an embed renders with these and nothing looser: the page it frames
 * is controlled by whoever shared the link, not by us.
 *
 * Deliberately absent from the sandbox: `allow-top-navigation*` (a frame could
 * redirect the app), `allow-modals`, `allow-downloads`, `allow-storage-access-*`.
 * `allow-same-origin` is safe only because `frameableEmbedUrl` refuses any URL
 * on the app's own origins (embedUrlGuard.ts); same-origin content would void
 * the sandbox.
 */

export const THIRD_PARTY_SANDBOX =
  "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation";

/** For provider-table embeds, whose players need these to work. */
export const PROVIDER_ALLOW =
  "autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write; web-share";

/** For a generic /embed of an arbitrary page a collaborator chose. */
export const GENERIC_ALLOW = "fullscreen; picture-in-picture";

/** YouTube answers error 153 to a frame that sends no Referer. */
export const EMBED_REFERRER_POLICY = "strict-origin-when-cross-origin";

export const DEFAULT_EMBED_HEIGHT = 480;
const MIN_EMBED_HEIGHT = 120;
const MAX_EMBED_HEIGHT = 1600;
export const DEFAULT_EMBED_ASPECT = "16/9";
const MAX_ASPECT_SIDE = 4000;

/** Block JSON is attacker-controlled: anything that is not a finite number
 *  gets the default; a number is rounded and clamped to [120, 1600] px. */
export function clampEmbedHeight(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_EMBED_HEIGHT;
  return Math.min(MAX_EMBED_HEIGHT, Math.max(MIN_EMBED_HEIGHT, Math.round(value)));
}

/** `"w/h"` with both sides 1-4000 and w/h within [1/4, 4], else "16/9". A
 *  hostile aspect could otherwise make a zero-height or page-tall frame. */
export function safeAspect(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_EMBED_ASPECT;
  const match = /^(\d{1,4})\/(\d{1,4})$/.exec(value);
  if (!match) return DEFAULT_EMBED_ASPECT;
  const width = Number(match[1]);
  const height = Number(match[2]);
  const inRange = (side: number): boolean => side >= 1 && side <= MAX_ASPECT_SIDE;
  if (!inRange(width) || !inRange(height)) return DEFAULT_EMBED_ASPECT;
  const ratio = width / height;
  if (ratio < 0.25 || ratio > 4) return DEFAULT_EMBED_ASPECT;
  return `${width}/${height}`;
}
