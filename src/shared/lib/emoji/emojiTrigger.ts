/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   emojiTrigger.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * THE one `:emoji` trigger rule, in `shared` so every surface can reach it:
 * block text (features/block-editor) AND the page title (entities/page) — a
 * feature-owned copy would be unreachable from entities and would drift.
 *
 * Fires on a BARE colon (empty filter → the full picker) and keeps filtering as
 * the user types, so `:` at the very start of a block opens it too. The colon
 * must follow the start of the text, whitespace, or an opening bracket, which
 * is what keeps `12:30`, `Note:` and `https://` from opening a picker.
 */

/** Trigger + filter capture. Group 1 is the (possibly empty) search filter. */
export const EMOJI_TRIGGER_RE = /(?:^|[\s([{]):([a-z0-9_+-]*)$/i;

export interface EmojiTriggerMatch {
  /** Search text typed after the colon ("" for a bare colon). */
  filter: string;
  /** Index of the triggering colon, for replacement on select. */
  colonIndex: number;
}

/** Match the trigger at the END of `text` (i.e. at the caret), or null. */
export function matchEmojiTrigger(text: string): EmojiTriggerMatch | null {
  const match = EMOJI_TRIGGER_RE.exec(text);
  if (!match) return null;
  return { filter: match[1] ?? "", colonIndex: text.lastIndexOf(":") };
}

/**
 * Text with the pending `:filter` trigger replaced by `insert`. When no trigger
 * is present (the picker was opened another way, e.g. `/emoji`), appends.
 */
export function applyEmojiInsert(text: string, insert: string): string {
  const match = matchEmojiTrigger(text);
  if (!match || match.colonIndex < 0) return text + insert;
  return text.slice(0, match.colonIndex) + insert;
}
