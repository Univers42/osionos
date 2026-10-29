/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AiInlinePanel.tsx                                  :+:      :+:    :+:   */
/*                                                    Reputation         */
/*   By: dlesieur <dlesieur@student.42.fr>          Reputation         */
/*                                                Reputation           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The "Ask AI" panel: Notion's "Edit with AI" bar, the width of the text
 * column. On an empty block it takes the block's place (Space on an empty
 * line); on a block with text it hangs under it, so the text stays readable.
 * The answer streams below the bar and the user decides what happens to it.
 *
 * Nothing is written into the page here. **Replace** / **Insert below** are
 * the only doors, and they live in the store (which owns the writes).
 *
 * The panel is a portal to the body — the editor page sets `container-type`,
 * which would otherwise make a `fixed` panel drift (same reason the slash
 * menu portals out).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";

import { useInlineAiStore } from "../model/inlineAiStore";
import { focusEditableBlock } from "@/features/block-editor/model/blockDomFocus";
import { errorWords } from "@/widgets/chat-shell/ui/errorWords";
import { AiPromptBar } from "./AiPromptBar";

const MIN_WIDTH = 360;
const VIEWPORT_MARGIN = 12;
const ANCHOR_GAP = 8;
/** The bar reaches this far past the text on each side, as in Notion. */
const COLUMN_BLEED = 12;
/** The empty block this attribute marks grows to the bar's height (global.css). */
const PROMPT_HOST_ATTR = "data-ai-prompt-host";

interface PanelAnchor {
  top: number;
  left: number;
  width: number;
}

/** The block element the panel hangs under. */
function blockElement(blockId: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const escape = globalThis.CSS?.escape;
  const selector = `[data-block-id="${escape ? escape(blockId) : blockId}"]`;
  return document.querySelector<HTMLElement>(selector);
}

const PANEL_BUTTON =
  "rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-50";

/** True when the block has no text — the bar then takes the line's place. */
function isEmptyBlock(element: HTMLElement): boolean {
  return (element.textContent ?? "").trim().length === 0;
}

/** The bar spans the text column, a little wider on each side, inside the viewport. */
function measureAnchor(element: HTMLElement): PanelAnchor {
  const rect = element.getBoundingClientRect();
  const viewportWidth = globalThis.innerWidth || 1024;
  const maxWidth = viewportWidth - VIEWPORT_MARGIN * 2;
  const width = Math.min(Math.max(rect.width + COLUMN_BLEED * 2, MIN_WIDTH), maxWidth);
  const left = Math.min(
    Math.max(rect.left - COLUMN_BLEED, VIEWPORT_MARGIN),
    viewportWidth - width - VIEWPORT_MARGIN,
  );
  const top = element.hasAttribute(PROMPT_HOST_ATTR) ? rect.top : rect.bottom + ANCHOR_GAP;
  return { top, left, width };
}

export const AiInlinePanel: React.FC = () => {
  const target = useInlineAiStore((state) => state.target);
  const command = useInlineAiStore((state) => state.command);
  const status = useInlineAiStore((state) => state.status);
  const text = useInlineAiStore((state) => state.text);
  const errorCode = useInlineAiStore((state) => state.errorCode);
  const selection = useInlineAiStore((state) => state.selection);

  const [instruction, setInstruction] = useState("");
  const [anchor, setAnchor] = useState<PanelAnchor | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const streaming = status === "streaming";
  const hasAnswer = status !== "idle" || text.length > 0;

  // An empty block hosts the bar: it grows to the bar's height so the next
  // block is not covered, and gives the room back when the bar closes.
  useEffect(() => {
    if (!target) return undefined;
    const element = blockElement(target.blockId);
    if (!element || !isEmptyBlock(element)) return undefined;
    element.setAttribute(PROMPT_HOST_ATTR, "");
    return () => element.removeAttribute(PROMPT_HOST_ATTR);
  }, [target]);

  // The bar follows its block: re-anchor on every scroll and resize.
  useEffect(() => {
    if (!target) return undefined;
    const measure = () => {
      const element = blockElement(target.blockId);
      setAnchor(element ? measureAnchor(element) : null);
    };
    measure();
    globalThis.addEventListener("scroll", measure, true);
    globalThis.addEventListener("resize", measure);
    return () => {
      globalThis.removeEventListener("scroll", measure, true);
      globalThis.removeEventListener("resize", measure);
    };
  }, [target]);

  // A new target, a new question: the typed instruction starts empty.
  const targetKey = target ? `${target.pageId}:${target.blockId}` : null;
  const [lastTargetKey, setLastTargetKey] = useState<string | null>(null);
  if (targetKey !== lastTargetKey) {
    setLastTargetKey(targetKey);
    setInstruction("");
  }

  // "ask" opens with its input focused — the user types the question.
  useEffect(() => {
    if (!target) return;
    if (command === "ask") inputRef.current?.focus();
  }, [command, target]);

  const discard = useCallback(() => {
    useInlineAiStore.getState().discard();
  }, []);

  // Esc throws the answer away — it was never written. The caret goes back to
  // the block the panel was anchored to (the prompt had taken focus), so the
  // user keeps typing where they left off.
  useEffect(() => {
    if (!target) return undefined;
    const blockId = target.blockId;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      discard();
      focusEditableBlock(blockId, "end");
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [discard, target]);

  const runAsk = useCallback(() => {
    if (streaming) return;
    void useInlineAiStore.getState().run("ask", instruction);
  }, [instruction, streaming]);

  const retry = useCallback(() => {
    const store = useInlineAiStore.getState();
    void store.run(store.command, store.instruction || undefined);
  }, []);

  const accept = useCallback((mode: "replace" | "insert-below") => {
    useInlineAiStore.getState().accept(mode);
  }, []);

  // A click outside throws the answer away: it was never written.
  useEffect(() => {
    if (!target) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      const node = event.target as Node | null;
      if (!node || panelRef.current?.contains(node)) return;
      discard();
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [discard, target]);

  const style = useMemo<React.CSSProperties>(
    () => ({
      position: "fixed",
      top: anchor?.top ?? VIEWPORT_MARGIN,
      left: anchor?.left ?? VIEWPORT_MARGIN,
      width: anchor?.width ?? MIN_WIDTH,
      zIndex: 10003,
    }),
    [anchor],
  );

  if (!target || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      data-testid="ai-inline-panel"
      role="dialog"
      aria-label="Ask AI"
      className="osio-surface-overlay flex flex-col overflow-hidden rounded-xl border border-[var(--osio-border-default)] shadow-osio-e4"
      style={style}
    >
      <AiPromptBar
        inputRef={inputRef}
        value={instruction}
        busy={streaming}
        onChange={setInstruction}
        onSubmit={runAsk}
      />

      {hasAnswer ? (
        <>
          <div
            aria-live="polite"
            aria-atomic="false"
            data-testid="ai-inline-answer"
            className="max-h-64 overflow-y-auto whitespace-pre-wrap border-t border-[var(--osio-menu-separator)] px-4 py-2 text-sm leading-relaxed text-[var(--osio-fg-default)]"
          >
            {status === "error" ? (
              <p className="text-[var(--osio-fg-muted)]">{errorWords(errorCode ?? undefined)}</p>
            ) : (
              text || <p className="text-[var(--osio-fg-subtle)]">Thinking…</p>
            )}
          </div>

          <div className="flex items-center gap-1 border-t border-[var(--osio-menu-separator)] px-2 py-1.5">
            {streaming ? (
              <button type="button" onClick={() => useInlineAiStore.getState().stop()} className={PANEL_BUTTON}>
                <span className="inline-flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" aria-hidden />
                  Stop
                </span>
              </button>
            ) : (
              <>
                {/* The `diagram` command answers with a SPEC, not with text: it is
                    inserted as a diagram block, so there is nothing to replace. */}
                {command !== "diagram" ? (
                  <button type="button" onClick={() => accept("replace")} disabled={!text} className={PANEL_BUTTON}>
                    Replace
                  </button>
                ) : null}
                <button type="button" onClick={() => accept("insert-below")} disabled={!text} className={PANEL_BUTTON}>
                  Insert below
                </button>
                <button type="button" onClick={retry} className={PANEL_BUTTON}>
                  Retry
                </button>
              </>
            )}
            <span className="flex-1" />
            {selection?.model ? (
              <span className="text-2xs text-[var(--osio-fg-subtle)]">{selection.model}</span>
            ) : null}
            <button type="button" onClick={discard} className={PANEL_BUTTON}>
              Discard
            </button>
          </div>
        </>
      ) : null}
    </div>,
    document.body,
  );
};
