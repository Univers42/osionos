/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profileStatus.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The status a profile card serves, typed on the client: parsing it defensively (the card is
 * a network body) and deciding whether it is still on show.
 *
 * Caveat: expiry is judged against the viewer's clock, so a badly set clock shows a status
 * up to its skew too long or too short. The server hides an expired status on its own read;
 * this only keeps an open page honest between two reads.
 */

import type { PersonStatus } from "@/shared/social/followApi";

export interface ShownStatus {
  emoji: string | null;
  text: string | null;
  busy: boolean;
}

const asText = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

export function parseStatus(raw: unknown): PersonStatus | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  return { emoji: asText(row.emoji), text: asText(row.text), expiresAt: asText(row.expiresAt), busy: row.busy === true };
}

export function activeStatus(status: PersonStatus | null | undefined, now: Date): ShownStatus | null {
  if (!status || (!status.emoji && !status.text && !status.busy)) return null;
  const expires = status.expiresAt ? Date.parse(status.expiresAt) : Number.NaN;
  if (Number.isFinite(expires) && expires <= now.getTime()) return null;
  return { emoji: status.emoji, text: status.text, busy: status.busy };
}
