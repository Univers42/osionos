/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SlashCommandMenu.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:04:21 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/08 19:29:07 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * SlashCommandMenu — slash command picker for the block editor.
 * Standalone replacement for @src/components/blocks/SlashCommandMenu.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { BlockType } from "@/entities/block";

export interface SlashMenuItem {
  label: string;
  type: BlockType;
  icon: string;
  description: string;
  calloutIcon?: string;
}

const SLASH_ITEMS: SlashMenuItem[] = [
  {
    label: "Text",
    type: "paragraph",
    icon: "T",
    description: "Plain text block",
  },
  {
    label: "Heading 1",
    type: "heading_1",
    icon: "H1",
    description: "Large heading",
  },
  {
    label: "Heading 2",
    type: "heading_2",
    icon: "H2",
    description: "Medium heading",
  },
  {
    label: "Heading 3",
    type: "heading_3",
    icon: "H3",
    description: "Small heading",
  },
  {
    label: "Bulleted list",
    type: "bulleted_list",
    icon: "•",
    description: "Bulleted list item",
  },
  {
    label: "Numbered list",
    type: "numbered_list",
    icon: "1.",
    description: "Numbered list item",
  },
  { label: "To-do", type: "to_do", icon: "☐", description: "Checkbox item" },
  {
    label: "Toggle",
    type: "toggle",
    icon: "▶",
    description: "Collapsible content",
  },
  { label: "Code", type: "code", icon: "</>", description: "Code block" },
  { label: "Quote", type: "quote", icon: '"', description: "Block quote" },
  {
    label: "Callout",
    type: "callout",
    icon: "💡",
    description: "Callout block",
    calloutIcon: "💡",
  },
  {
    label: "Divider",
    type: "divider",
    icon: "—",
    description: "Horizontal divider",
  },
  {
    label: "Table",
    type: "table_block",
    icon: "⊞",
    description: "Simple table",
  },
];

interface SlashCommandMenuProps {
  position: { x: number; y: number };
  filter: string;
  onSelect: (item: SlashMenuItem) => void;
  onClose: () => void;
}

export const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  position,
  filter,
  onSelect,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [prevFilter, setPrevFilter] = useState(filter);

  // Reset index when filter changes (Synchronous reset during render)
  if (filter !== prevFilter) {
    setPrevFilter(filter);
    setActiveIdx(0);
  }

  const filtered = useMemo(() => {
    if (!filter) return SLASH_ITEMS;
    const lower = filter.toLowerCase();
    return SLASH_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(lower) ||
        item.type.toLowerCase().includes(lower),
    );
  }, [filter]);
  const effectiveActiveIdx = Math.min(
    activeIdx,
    Math.max(filtered.length - 1, 0),
  );

  // Click outside → close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Keyboard navigation (captured globally since focus stays in contentEditable)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[effectiveActiveIdx])
          onSelect(filtered[effectiveActiveIdx]);
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [filtered, effectiveActiveIdx, onSelect, onClose]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={ref}
      className="fixed z-[10000] w-64 max-h-72 overflow-y-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-primary)] shadow-xl py-1"
      style={{ top: position.y + 4, left: position.x }}
    >
      <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-faint)]">
        Blocks
      </p>
      {filtered.map((item, idx) => (
        <button
          key={item.type}
          type="button"
          className={`w-full flex items-center gap-3 px-3 py-1.5 text-left transition-colors ${
            idx === effectiveActiveIdx
              ? "bg-[var(--color-surface-hover)]"
              : "hover:bg-[var(--color-surface-hover)]"
          }`}
          onMouseEnter={() => setActiveIdx(idx)}
          onClick={() => onSelect(item)}
        >
          <span className="w-6 h-6 flex items-center justify-center rounded bg-[var(--color-surface-secondary)] text-xs font-medium text-[var(--color-ink-muted)] shrink-0">
            {item.icon}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm text-[var(--color-ink)]">
              {item.label}
            </span>
            <span className="block text-xs text-[var(--color-ink-muted)] truncate">
              {item.description}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
};
