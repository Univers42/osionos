/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   emojiTone.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Skin-tone composition for the emoji catalog. The catalog ships only base
 * emoji (toneCapable-flagged); variants are composed here on demand. The
 * insertion rule mirrors scripts/gen-icon-catalogs.mjs (which validates it
 * against the fully-qualified RGI set at generation time): the modifier goes
 * after the first code point, replacing a leading variation selector (FE0F).
 */

/** Fitzpatrick modifiers: light → dark. Index 0 of the picker = no tone. */
export const EMOJI_SKIN_TONES = [0x1f3fb, 0x1f3fc, 0x1f3fd, 0x1f3fe, 0x1f3ff] as const;

const VARIATION_SELECTOR = 0xfe0f;

/** Compose `emoji` with a Fitzpatrick modifier. `tone` 0 = unchanged; 1..5 index
 *  EMOJI_SKIN_TONES. Only valid on catalog entries flagged toneCapable. */
export function applyEmojiTone(emoji: string, tone: number): string {
  if (tone <= 0 || tone > EMOJI_SKIN_TONES.length) return emoji;
  const codePoints = [...emoji].map((c) => c.codePointAt(0) ?? 0);
  const rest = codePoints.slice(1);
  if (rest[0] === VARIATION_SELECTOR) rest.shift();
  return String.fromCodePoint(codePoints[0], EMOJI_SKIN_TONES[tone - 1], ...rest);
}
