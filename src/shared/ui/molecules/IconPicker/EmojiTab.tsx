/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EmojiTab.tsx                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { EMOJI_ITEMS, filterEmojiItems, type EmojiItem } from "@/shared/ui/molecules/EmojiPicker/emojiSearch";
import { loadEmojiCatalog, type EmojiCatalog } from "@/shared/ui/molecules/EmojiPicker/emojiCatalog";
import { applyEmojiTone, EMOJI_SKIN_TONES } from "@/shared/lib/emoji/emojiTone";
import { VirtualGrid, type GridSection } from "./VirtualRows";

const TONE_STORAGE_KEY = "osio.emoji.tone";

function readStoredTone(): number {
  try {
    const raw = Number(globalThis.window?.localStorage.getItem(TONE_STORAGE_KEY) ?? 0);
    return Number.isInteger(raw) && raw >= 0 && raw <= EMOJI_SKIN_TONES.length ? raw : 0;
  } catch {
    return 0;
  }
}

function groupSections(items: EmojiItem[], groups: readonly string[]): GridSection<EmojiItem>[] {
  const byGroup = new Map<string, EmojiItem[]>(groups.map((g) => [g, []]));
  for (const item of items) {
    const key = item.group ?? "";
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(item);
  }
  return [...byGroup.entries()].map(([title, groupItems]) => ({ title, items: groupItems }));
}

/** Full RGI emoji grid (~1.9k, virtualized, grouped) with a skin-tone selector.
 *  Renders the small legacy set instantly while the full catalog chunk loads. */
export const EmojiTab: React.FC<{ query: string; bg?: string; onPick: (emoji: string) => void }> = ({ query, bg, onPick }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [catalog, setCatalog] = useState<EmojiCatalog | null>(null);
  const [tone, setTone] = useState(readStoredTone);

  useEffect(() => {
    let mounted = true;
    void loadEmojiCatalog().then((loaded) => { if (mounted) setCatalog(loaded); });
    return () => { mounted = false; };
  }, []);

  const sections = useMemo(() => {
    const source = catalog?.items ?? EMOJI_ITEMS;
    const toned = tone > 0
      ? source.map((item) => (item.toneCapable ? { ...item, value: applyEmojiTone(item.value, tone) } : item))
      : source;
    const filtered = filterEmojiItems(toned, query);
    if (query.trim()) return [{ items: filtered }];
    const groups = catalog?.groups ?? [...new Set(filtered.map((item) => item.group ?? ""))];
    return groupSections(filtered, groups);
  }, [catalog, tone, query]);

  const pickTone = (next: number) => {
    setTone(next);
    try { globalThis.window?.localStorage.setItem(TONE_STORAGE_KEY, String(next)); } catch { /* private mode */ }
  };

  const empty = sections.every((section) => section.items.length === 0);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-[var(--osio-border-default)] px-3 py-1">
        <span className="mr-1 text-xs text-[var(--osio-fg-subtle)]">Tone</span>
        {Array.from({ length: EMOJI_SKIN_TONES.length + 1 }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-label={i === 0 ? "No skin tone" : `Skin tone ${i}`}
            aria-pressed={tone === i}
            onClick={() => pickTone(i)}
            className={`flex h-7 w-7 items-center justify-center rounded-md text-base leading-none transition-colors duration-[120ms] ${
              tone === i ? "bg-[var(--osio-bg-muted)] shadow-[inset_0_0_0_1px_var(--osio-border-strong)]" : "hover:bg-[var(--osio-bg-hover)]"
            }`}
          >
            {applyEmojiTone("✋", i)}
          </button>
        ))}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto py-1">
        {empty ? (
          <p className="p-6 text-center text-sm text-[var(--osio-fg-muted)]">No emoji match “{query}”.</p>
        ) : (
          <VirtualGrid
            scrollRef={scrollRef}
            sections={sections}
            perRow={8}
            renderItem={(item) => (
              <button
                key={item.id}
                type="button"
                title={item.label ?? item.id}
                onClick={() => onPick(item.value)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-xl leading-none transition-colors duration-[120ms] hover:bg-[var(--osio-bg-hover)]"
                style={bg ? { background: bg, borderRadius: 8 } : undefined}
              >
                {item.value}
              </button>
            )}
          />
        )}
      </div>
    </div>
  );
};
