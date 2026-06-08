/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IconPicker.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { Suspense, useEffect, useRef, useState } from "react";
import { Smile, Shapes, ImagePlus, Search } from "lucide-react";
import { parseIconValue, serializeIconValue, type IconValue } from "@/shared/lib/iconValue/iconValue";
import { ColorSwatches } from "./ColorSwatches";
import { EmojiTab } from "./EmojiTab";
import { CustomTab } from "./CustomTab";

const LazyIconTab = React.lazy(() => import("./IconTab"));

type TabId = "emoji" | "icons" | "custom";
const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: "emoji", label: "Emoji", icon: <Smile size={15} /> },
  { id: "icons", label: "Icons", icon: <Shapes size={15} /> },
  { id: "custom", label: "Custom", icon: <ImagePlus size={15} /> },
];

interface Props {
  current?: string;
  onSelect: (value: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Beautiful unified asset picker: Emoji · Icons (lucide) · Custom SVG, with a color row. */
export const IconPicker: React.FC<Props> = ({ current, onSelect, onRemove, onClose }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const parsed = parseIconValue(current);
  const [tab, setTab] = useState<TabId>(parsed?.kind === "icon" ? "icons" : parsed?.kind === "image" ? "custom" : "emoji");
  const [query, setQuery] = useState("");
  const [color, setColor] = useState<string | undefined>(parsed?.color ?? parsed?.bg);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const emit = (value: IconValue) => { onSelect(serializeIconValue(value)); onClose(); };

  return (
    <div
      ref={panelRef}
      data-testid="emoji-picker"
      className="absolute left-0 top-[calc(100%+8px)] z-[1000] flex w-[340px] flex-col overflow-hidden rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-[0_18px_48px_rgba(15,23,42,0.18)]"
    >
      <div className="flex gap-1 border-b border-[var(--osio-border-default)] p-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); setQuery(""); }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition ${
              tab === t.id ? "bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-default)]" : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab !== "custom" && (
        <div className="flex items-center gap-2 border-b border-[var(--osio-border-default)] px-3 py-2">
          <Search size={14} className="text-[var(--osio-fg-subtle)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${tab}…`}
            className="w-full bg-transparent text-sm text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)]"
          />
        </div>
      )}

      <ColorSwatches value={color} onChange={setColor} />

      <div className="max-h-[260px] min-h-[120px] overflow-auto">
        {tab === "emoji" && <EmojiTab query={query} bg={color} onPick={(emoji) => emit({ kind: "emoji", ref: emoji, bg: color })} />}
        {tab === "icons" && (
          <Suspense fallback={<p className="p-6 text-center text-sm text-[var(--osio-fg-muted)]">Loading icons…</p>}>
            <LazyIconTab query={query} color={color} onPick={(name) => emit({ kind: "icon", ref: name, color })} />
          </Suspense>
        )}
        {tab === "custom" && <CustomTab onPick={(ref) => emit({ kind: "image", ref, color })} />}
      </div>

      <div className="flex justify-end border-t border-[var(--osio-border-default)] px-3 py-2">
        <button
          type="button"
          data-testid="emoji-picker-remove"
          onClick={() => { onRemove(); onClose(); }}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--osio-fg-muted)] transition hover:bg-[var(--osio-bg-subtle)] hover:text-[var(--osio-danger)]"
        >
          Remove icon
        </button>
      </div>
    </div>
  );
};
