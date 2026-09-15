/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   emojiSearch.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { DEFAULT_EMOJI_PICKER_ITEMS } from "@univers42/ui-collection";

export interface EmojiItem {
  id: string;
  value: string;
  label?: string;
  keywords?: string[];
  group?: string;
  /** Accepts a Fitzpatrick modifier via applyEmojiTone() (full-catalog entries only). */
  toneCapable?: boolean;
}

/** The shared emoji dataset (names + keywords + unicode value) from ui-collection.
 *  Instant fallback while the full generated catalog (emojiCatalog.ts) lazy-loads. */
export const EMOJI_ITEMS = DEFAULT_EMOJI_PICKER_ITEMS as unknown as EmojiItem[];

/** Filters an emoji set by name / id / keywords / group. Empty query = all. */
export function filterEmojiItems(items: EmojiItem[], query: string): EmojiItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) =>
    `${item.label ?? ""} ${item.id} ${(item.keywords ?? []).join(" ")} ${item.group ?? ""}`
      .toLowerCase()
      .includes(q),
  );
}

/** Filters the shared (legacy) emoji set. Kept for existing call sites. */
export function searchEmojis(query: string): EmojiItem[] {
  return filterEmojiItems(EMOJI_ITEMS, query);
}
