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
}

/** The shared emoji dataset (names + keywords + unicode value) from ui-collection. */
export const EMOJI_ITEMS = DEFAULT_EMOJI_PICKER_ITEMS as unknown as EmojiItem[];

/** Filters the shared emoji set by name / id / keywords / group. Empty query = all. */
export function searchEmojis(query: string): EmojiItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return EMOJI_ITEMS;
  return EMOJI_ITEMS.filter((item) =>
    `${item.label ?? ""} ${item.id} ${(item.keywords ?? []).join(" ")} ${item.group ?? ""}`
      .toLowerCase()
      .includes(q),
  );
}
