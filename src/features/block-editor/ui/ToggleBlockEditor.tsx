/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ToggleBlockEditor.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "react";
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
  onRequestSlashMenu?: (position: { x: number; y: number }) => void;
}

/* ── Constants ──────────────────────────────────────────────────────── */

const FOCUS_DELAY_MS = 30;

/* ── Helpers ────────────────────────────────────────────────────────── */

function createEmptyBlock(): Block {
  return { id: crypto.randomUUID(), type: "paragraph", content: "" };
}

function focusBySelector(selector: string, cursorEnd = false): void {
  setTimeout(() => {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (!el) return;
    el.focus();
    if (cursorEnd && el.childNodes.length > 0) {
      const sel = globalThis.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, FOCUS_DELAY_MS);
}

/* ── Component ──────────────────────────────────────────────────────── */

export const ToggleBlockEditor: React.FC<ToggleBlockEditorProps> = ({
  block,
  pageId,
  onChange,
  onKeyDown,
  onRequestSlashMenu,
}) => {
  const [expanded, setExpanded] = useState(!block.collapsed);
  const updateBlock = usePageStore((s) => s.updateBlock);
  const pendingFocusId = useRef<string | null>(null);

  const children: Block[] = useMemo(
    () => block.children ?? [],
    [block.children],
  );

  /* ── Child persistence ──────────────────────────────────────────── */

  const setChildren = useCallback(
    (next: Block[]) => updateBlock(pageId, block.id, { children: next }),
    [pageId, block.id, updateBlock],
  );

  /* ── Focus management ───────────────────────────────────────────── */

  const focusChild = useCallback((childId: string, cursorEnd = false) => {
    focusBySelector(
      `[data-toggle-child="${childId}"] [contenteditable]`,
      cursorEnd,
    );
  }, []);

  useEffect(() => {
    if (pendingFocusId.current && expanded && children.length > 0) {
      focusChild(pendingFocusId.current);
      pendingFocusId.current = null;
    }
  }, [expanded, children, focusChild]);

  /* ── Expand / collapse ──────────────────────────────────────────── */

  const handleToggle = useCallback(() => {
    const opening = !expanded;
    if (opening && children.length === 0) {
      const child = createEmptyBlock();
      setChildren([child]);
      pendingFocusId.current = child.id;
    }
    setExpanded(opening);
  }, [expanded, children.length, setChildren]);

  /* ── Child mutations ────────────────────────────────────────────── */

  const handleChildChange = useCallback(
    (childId: string, text: string) => {
      setChildren(
        children.map((c) => (c.id === childId ? { ...c, content: text } : c)),
      );
    },
    [children, setChildren],
  );

  const insertChildAfter = useCallback(
    (afterId: string) => {
      const child = createEmptyBlock();
      const idx = children.findIndex((c) => c.id === afterId);
      const next = [...children];
      next.splice(idx + 1, 0, child);
      setChildren(next);
      focusChild(child.id);
    },
    [children, setChildren, focusChild],
  );

  const removeChild = useCallback(
    (childId: string) => {
      const idx = children.findIndex((c) => c.id === childId);
      if (idx === -1) return;

      if (children.length === 1) {
        const blank = { ...children[0], content: "" };
        setChildren([blank]);
        focusChild(blank.id);
        return;
      }

      const focusTarget = idx > 0 ? children[idx - 1].id : children[1].id;
      setChildren(children.filter((c) => c.id !== childId));
      focusChild(focusTarget, true);
    },
    [children, setChildren, focusChild],
  );

  /* ── Key handlers ───────────────────────────────────────────────── */

  const handleSummaryKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (children.length === 0) {
          const child = createEmptyBlock();
          setChildren([child]);
          pendingFocusId.current = child.id;
        } else {
          focusChild(children[0].id);
        }
        if (!expanded) setExpanded(true);
        return;
      }
      onKeyDown(e);
    },
    [expanded, children, setChildren, focusChild, onKeyDown],
  );

  const handleChildKeyDown = useCallback(
    (e: React.KeyboardEvent, childId: string) => {
      const child = children.find((c) => c.id === childId);
      if (!child) return;
      const idx = children.findIndex((c) => c.id === childId);

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        insertChildAfter(childId);
        return;
      }

      if (e.key === "Backspace" && !child.content.trim()) {
        e.preventDefault();
        e.stopPropagation();
        removeChild(childId);
        return;
      }

      if (e.key === "ArrowUp" && idx > 0) {
        e.preventDefault();
        focusChild(children[idx - 1].id, true);
        return;
      }

      if (e.key === "ArrowDown" && idx < children.length - 1) {
        e.preventDefault();
        focusChild(children[idx + 1].id);
      }
    },
    [children, insertChildAfter, removeChild, focusChild],
  );

  /* ── Render ─────────────────────────────────────────────────────── */

  return (
    <div className="pl-0.5">
      {/* Summary row */}
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

      {/* Children (editable) */}
      {expanded && (
        <div className="ml-6 mt-0.5 pl-3 border-l-2 border-[var(--color-line)]">
          {children.map((child) => (
            <div key={child.id} data-toggle-child={child.id}>
              <EditableContent
                content={child.content}
                className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5"
                placeholder="Type here..."
                pageId={pageId}
                onChange={(text) => handleChildChange(child.id, text)}
                onKeyDown={(e) => handleChildKeyDown(e, child.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
