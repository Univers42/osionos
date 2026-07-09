/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EmojiTab.tsx                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { searchEmojis } from "@/shared/ui/molecules/EmojiPicker/emojiSearch";

/** Searchable emoji grid (reuses the shared ui-collection emoji set). */
export const EmojiTab: React.FC<{ query: string; bg?: string; onPick: (emoji: string) => void }> = ({ query, bg, onPick }) => {
  const items = searchEmojis(query);

  if (items.length === 0) {
    return <p className="p-6 text-center text-sm text-[var(--osio-fg-muted)]">No emoji match “{query}”.</p>;
  }
  return (
    <div className="grid grid-cols-8 gap-1 p-2">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          title={it.label ?? it.id}
          onClick={() => onPick(it.value)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-xl leading-none transition-colors duration-[120ms] hover:bg-[var(--osio-bg-hover)]"
          style={bg ? { background: bg, borderRadius: 8 } : undefined}
        >
          {it.value}
        </button>
      ))}
    </div>
  );
};
