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
import { DEFAULT_EMOJI_PICKER_ITEMS } from "@univers42/ui-collection";

interface EmojiItem { id: string; value: string; label?: string; keywords?: string[]; group?: string }
const ITEMS = DEFAULT_EMOJI_PICKER_ITEMS as unknown as EmojiItem[];

/** Searchable emoji grid (reuses the ui-collection emoji set). */
export const EmojiTab: React.FC<{ query: string; bg?: string; onPick: (emoji: string) => void }> = ({ query, bg, onPick }) => {
  const q = query.trim().toLowerCase();
  const items = q
    ? ITEMS.filter((it) => `${it.label ?? ""} ${it.id} ${(it.keywords ?? []).join(" ")} ${it.group ?? ""}`.toLowerCase().includes(q))
    : ITEMS;

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
          className="flex h-8 w-8 items-center justify-center rounded-md text-xl leading-none transition hover:bg-[var(--osio-bg-hover)]"
          style={bg ? { background: bg, borderRadius: 8 } : undefined}
        >
          {it.value}
        </button>
      ))}
    </div>
  );
};
