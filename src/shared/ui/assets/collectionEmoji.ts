/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collectionEmoji.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The glyphs the app hard-codes (seed pages, default page icons, role badges). Literals,
// byte-equal to ui-collection's emoji list wherever it has the id (the canvas test
// collection-emoji checks it): reading them out of that list put its 83.5 KB module, and a
// Map built over all of it, on every boot for these ~20 values (measured 2026-10-13).
const COLLECTION_EMOJI = {
  wave: '👋',
  'thumbs-up': '👍',
  fire: '🔥',
  sparkles: '✨',
  rocket: '🚀',
  party: '🥳',
  check: '✅',
  warning: '⚠️',
  idea: '💡',
  brain: '🧠',
  palette: '🎨',
  package: '📦',
  pin: '📌',
  paperclip: '📎',
  puzzle: '🧩',
  tools: '🧰',
  megaphone: '📣',
  heart: '❤️',
  star: '⭐',
  moon: '🌙',
  sun: '☀️',
  leaf: '🌿',
  robot: '🤖',
  cool: '😎',
} as const;

export type CollectionEmojiId = keyof typeof COLLECTION_EMOJI;

const DEFAULT_PAGE_EMOJI_PRESET_IDS: readonly CollectionEmojiId[] = [
  'rocket',
  'idea',
  'package',
  'pin',
  'sparkles',
  'star',
  'palette',
  'tools',
];

export function getCollectionEmojiValue(id: CollectionEmojiId): string {
  return COLLECTION_EMOJI[id];
}

export function randomUiCollectionEmoji(): string {
  const id =
    DEFAULT_PAGE_EMOJI_PRESET_IDS[
      Math.floor(Math.random() * DEFAULT_PAGE_EMOJI_PRESET_IDS.length)
    ];
  return COLLECTION_EMOJI[id];
}

export const COLLECTION_ROLE_BADGES: Record<string, string> = {
  admin: COLLECTION_EMOJI.star,
  collaborator: COLLECTION_EMOJI.palette,
  member: COLLECTION_EMOJI.palette,
  guest: COLLECTION_EMOJI.cool,
};
