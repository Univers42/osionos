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
 * The "Ask AI" panel: anchored under the block, the answer streams into it,
 * and the user decides what happens to it.
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
import { Loader2, Sparkles, X } from "lucide-react";

import { listCommands, type AiCommand } from "../api/aiClient";
import { useInlineAiStore } from "../model/inlineAiStore";
import { focusEditableBlock } from "@/features/block-editor/model/blockDomFocus";
import { errorWords } from "@/widgets/chat-shell/ui/errorWords";

const PANEL_WIDTH = 420;
const VIEWPORT_MARGIN = 12;
const ANCHOR_GAP = 8;

/** The editor commands of the service — fetched ONCE per session. */
let editorCommands: AiCommand[] = [];
let editorCommandsLoaded = false;

/** The service's editor commands, fetched once and remembered for the session. */
export function editorCommandsOnce(): Promise<AiCommand[]> {
  if (editorCommandsLoaded) return Promise.resolve(editorCommands);
  editorCommandsLoaded = true;
  return listCommands("editor")
    .then((commands) => {
      editorCommands = commands;
      return commands;
    })
    .catch(() => {
      // No service, no commands: the free-text input still works.
      editorCommands = [];
      return editorCommands;
    });
}

/** "action-items" → "Action items" — the label of a service command. */
function commandLabel(name: string): string {
  const words = name.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
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

export const AiInlinePanel: React.FC = () => {
  const target = useInlineAiStore((state) => state.target);
  const command = useInlineAiStore((state) => state.command);
  const status = useInlineAiStore((state) => state.status);
  const text = useInlineAiStore((state) => state.text);
  const errorCode = useInlineAiStore((state) => state.errorCode);
  const selection = useInlineAiStore((state) => state.selection);

  const [instruction, setInstruction] = useState("");
  const [commands, setCommands] = useState<AiCommand[]>([]);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const streaming = status === "streaming";

  // The service's command list — once per session, and only when the panel
  // actually opens (an app with no AI service must not ask for it).
  useEffect(() => {
    if (!target) return undefined;
    let alive = true;
    void editorCommandsOnce().then((list) => {
      if (alive) setCommands(list);
    });
    return () => {
      alive = false;
    };
  }, [target]);

  // The panel hangs under its block: re-anchor on every scroll and resize.
  useEffect(() => {
    if (!target) return undefined;
    const measure = () => {
      const element = blockElement(target.blockId);
      if (!element) {
        setAnchor(null);
        return;
      }
      const rect = element.getBoundingClientRect();
      const viewportWidth = globalThis.innerWidth || 1024;
      const left = Math.min(
        Math.max(rect.left, VIEWPORT_MARGIN),
        Math.max(VIEWPORT_MARGIN, viewportWidth - PANEL_WIDTH - VIEWPORT_MARGIN),
      );
      setAnchor({ top: rect.bottom + ANCHOR_GAP, left });
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

  const runCommand = useCallback(
    (name: string) => {
      if (streaming) return;
      void useInlineAiStore.getState().run(name);
    },
    [streaming],
  );

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

  const style = useMemo<React.CSSProperties>(() => {
    const viewportWidth = globalThis.innerWidth || 1024;
    const left = anchor
      ? Math.min(
          Math.max(anchor.left, VIEWPORT_MARGIN),
          Math.max(VIEWPORT_MARGIN, viewportWidth - PANEL_WIDTH - VIEWPORT_MARGIN),
        )
      : VIEWPORT_MARGIN;
    return {
      position: "fixed",
      top: anchor?.top ?? VIEWPORT_MARGIN,
      left,
      width: PANEL_WIDTH,
      maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
      zIndex: 10003,
    };
  }, [anchor]);

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
      <div className="flex items-center gap-2 border-b border-[var(--osio-menu-separator)] px-2 py-1.5">
        <Sparkles size={14} className="shrink-0 text-[var(--osio-fg-muted)]" aria-hidden />
        <input
          ref={inputRef}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            runAsk();
          }}
          placeholder="Ask AI anything…"
          aria-label="Ask AI anything"
          className="min-w-0 flex-1 bg-transparent px-1 py-1 text-sm text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)]"
        />
        <button
          type="button"
          onClick={discard}
          title="Discard"
          aria-label="Discard the answer"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      {commands.length > 0 ? (
        <div className="flex flex-wrap gap-1 border-b border-[var(--osio-menu-separator)] px-2 py-1.5">
          {commands.map((entry) => (
            <button
              key={entry.name}
              type="button"
              title={entry.description}
              onClick={() => runCommand(entry.name)}
              disabled={streaming}
              className="rounded-md px-2 py-0.5 text-2xs font-medium text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {commandLabel(entry.name)}
            </button>
          ))}
        </div>
      ) : null}

      <div
        aria-live="polite"
        aria-atomic="false"
        data-testid="ai-inline-answer"
        className="max-h-64 min-h-16 overflow-y-auto whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed text-[var(--osio-fg-default)]"
      >
        {status === "error" ? (
          <p className="text-[var(--osio-fg-muted)]">{errorWords(errorCode ?? undefined)}</p>
        ) : text ? (
          text
        ) : (
          <p className="text-[var(--osio-fg-subtle)]">
            {streaming ? "Thinking…" : "The answer shows up here."}
          </p>
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
              <button
                type="button"
                onClick={() => accept("replace")}
                disabled={!text}
                className={PANEL_BUTTON}
              >
                Replace
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => accept("insert-below")}
              disabled={!text}
              className={PANEL_BUTTON}
            >
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
        <span className="text-2xs text-[var(--osio-fg-subtle)]">
          {command ? commandLabel(command) : ""}
        </span>
        <button type="button" onClick={discard} className={PANEL_BUTTON}>
          Discard
        </button>
      </div>
    </div>,
    document.body,
  );
};
