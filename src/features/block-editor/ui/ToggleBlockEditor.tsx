/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ToggleBlockEditor.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: vjan-nie <vjan-nie@student.42madrid.com    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/16 10:35:46 by vjan-nie         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState, useCallback } from "react";
import { ChevronRight } from "lucide-react";

import { EditableContent } from "@/components/blocks/EditableContent";
import type { Block } from "@/entities/block";
import { usePageStore } from "@/store/usePageStore";

/* ── Types ──────────────────────────────────────────────────────────── */

interface ToggleBlockEditorProps {
  block: Block;
  pageId: string;
  onChange: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  focusBlock: (blockId: string, cursorEnd?: boolean) => void;
  onRequestSlashMenu?: (position: { x: number; y: number }) => void;
}

/* ── Component ──────────────────────────────────────────────────────── */

/**
 * Renders only the toggle summary row (chevron + editable text).
 *
 * Children are NOT rendered here — they are rendered by BlockTree in
 * PlaygroundPageEditor via the universal children rendering path.
 * This component only controls the expanded/collapsed state and
 * communicates it to the store so BlockTree knows whether to render
 * the children subtree.
 */
export const ToggleBlockEditor: React.FC<ToggleBlockEditorProps> = ({
  block,
  pageId,
  onChange,
  onKeyDown,
  focusBlock,
  onRequestSlashMenu,
}) => {
  const [expanded, setExpanded] = useState(!block.collapsed);
  const updateBlock = usePageStore((s) => s.updateBlock);

  /* ── Expand / collapse ──────────────────────────────────────────── */

  const handleToggle = useCallback(() => {
    const opening = !expanded;

    if (opening && !block.children?.length) {
      const child: Block = {
        id: crypto.randomUUID(),
        type: "paragraph",
        content: "",
      };
      updateBlock(pageId, block.id, { children: [child] });
      updateBlock(pageId, block.id, { collapsed: false });
      setExpanded(true);

      focusBlock(child.id);
      return;
    }

    updateBlock(pageId, block.id, { collapsed: !opening });
    setExpanded(opening);
  }, [expanded, block.id, block.children?.length, pageId, updateBlock, focusBlock]);

  /* ── Summary key handler ────────────────────────────────────────── */

  const handleSummaryKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();

        if (block.children?.length) {
          if (!expanded) {
            updateBlock(pageId, block.id, { collapsed: false });
            setExpanded(true);
          }

          const firstChildId = block.children[0].id;
          focusBlock(firstChildId);
        } else {
          const child: Block = {
            id: crypto.randomUUID(),
            type: "paragraph",
            content: "",
          };
          updateBlock(pageId, block.id, { children: [child] });
          updateBlock(pageId, block.id, { collapsed: false });
          setExpanded(true);

          focusBlock(child.id);
        }
        return;
      }
      onKeyDown(e);
    },
    [expanded, block.id, block.children, pageId, updateBlock, focusBlock, onKeyDown],
  );

  /* ── Render ─────────────────────────────────────────────────────── */

  return (
    <div className="pl-0.5">
      <div className="flex items-start gap-1">
        <button
          type="button"
          onClick={handleToggle}
          className="shrink-0 mt-[3px] w-5 h-5 rounded hover:bg-[var(--color-surface-hover)] flex items-center justify-center"
        >
          <ChevronRight
            size={14}
            className={[
              "text-[var(--color-ink-muted)] transition-transform duration-150",
              expanded ? "rotate-90" : "",
            ].join(" ")}
          />
        </button>
        <div className="flex-1">
          <EditableContent
            content={block.content}
            className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5"
            placeholder="Toggle"
            pageId={pageId}
            onChange={onChange}
            onKeyDown={handleSummaryKeyDown}
            onRequestSlashMenu={onRequestSlashMenu}
          />
        </div>
      </div>

      {/* Empty toggle hint — only shown when expanded with no children.
          Children themselves are rendered by BlockTree externally. */}
      {expanded && !block.children?.length && (
        <div className="ml-6 mt-0.5 pl-3 border-l-2 border-[var(--color-line)]">
          <span className="text-xs text-[var(--color-ink-faint)] py-1 italic">
            Empty toggle
          </span>
        </div>
      )}
    </div>
  );
};
