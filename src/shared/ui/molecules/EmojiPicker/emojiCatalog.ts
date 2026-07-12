/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   emojiCatalog.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { EMOJI_ITEMS, type EmojiItem } from "./emojiSearch";

export interface EmojiCatalog {
  items: EmojiItem[];
  groups: readonly string[];
}

/** Parse the generated pipe-delimited catalog (glyph|name|groupIndex|toneCapable). */
export function parseEmojiCatalog(data: string, groups: readonly string[]): EmojiItem[] {
  const legacyKeywords = new Map<string, string[]>();
  for (const item of EMOJI_ITEMS) if (item.keywords?.length) legacyKeywords.set(item.value, item.keywords);
  return data.split("\n").map((line) => {
    const [value, label, group, tone] = line.split("|");
    return {
      id: value,
      value,
      label,
      group: groups[Number(group)],
      keywords: legacyKeywords.get(value),
      toneCapable: tone === "1",
    };
  });
}

let cached: Promise<EmojiCatalog> | null = null;

/** The full RGI emoji set (~1.9k), lazy-loaded as its own chunk so surfaces that
 *  never open the picker pay nothing. Legacy ui-collection keywords are merged in
 *  so existing search terms keep matching. Resolves once; then cached. */
export function loadEmojiCatalog(): Promise<EmojiCatalog> {
  cached ??= import("./emojiCatalog.generated").then(
    ({ EMOJI_CATALOG_DATA, EMOJI_CATALOG_GROUPS }) => ({
      items: parseEmojiCatalog(EMOJI_CATALOG_DATA, EMOJI_CATALOG_GROUPS),
      groups: EMOJI_CATALOG_GROUPS,
    }),
  );
  return cached;
}
