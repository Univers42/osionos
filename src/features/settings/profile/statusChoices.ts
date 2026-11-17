/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   statusChoices.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The status editor's choices: the emoji it accepts, the presets that fill emoji and text in
 * one click, and the expiry options. The limits are the bridge's (peopleSocialModel).
 *
 * Caveat: `isStatusEmoji` checks Unicode properties, not the CLDR emoji list, so a newer
 * emoji the runtime does not know yet is refused and a pictograph that is not in the CLDR
 * list (some dingbats) is accepted. Either way the bridge accepts any text up to 8 characters.
 */

import { STATUS_EMOJI_LIMIT } from "../people/peopleSocialModel";

const EMOJI_PART = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\u200D|\uFE0F|\u20E3|[\u{E0020}-\u{E007F}]|[0-9#*])+$/u;
const EMOJI_CORE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u;

export function isStatusEmoji(value: string): boolean {
  return Array.from(value).length <= STATUS_EMOJI_LIMIT && EMOJI_PART.test(value) && EMOJI_CORE.test(value);
}

export const STATUS_PRESETS = [
  { emoji: "📅", text: "In a meeting" },
  { emoji: "🎯", text: "Focusing" },
  { emoji: "🏠", text: "Working remotely" },
  { emoji: "🏖️", text: "On vacation" },
  { emoji: "🤒", text: "Out sick" },
] as const;

export const EXPIRY_CHOICES = [
  { label: "Never", minutes: 0 },
  { label: "In 30 minutes", minutes: 30 },
  { label: "In 1 hour", minutes: 60 },
  { label: "In 4 hours", minutes: 240 },
  { label: "In 24 hours", minutes: 1440 },
];

/** The ISO instant `minutes` from `nowMs`, or "" for a status that does not expire. */
export function expiryIso(minutes: number, nowMs: number): string {
  return minutes > 0 ? new Date(nowMs + minutes * 60_000).toISOString() : "";
}
