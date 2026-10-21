/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineAiStore.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * "Ask AI" inside the editor: the panel under a block, the answer, the choice.
 *
 * Nothing is written into the page until the user accepts. The answer streams
 * into this store; **Replace** / **Insert below** are the only doors to the
 * page, and both go through the injected `updateBlock` / `insertBlock`.
 *
 * Everything the store needs from the outside is INJECTED (see
 * {@link InlineAiDeps}), so the whole flow — stream, accept, retry, discard —
 * is testable without a browser and without a service.
 */

import { create } from "zustand";
import { pumpSseStream } from "@osionos/http-gate";

import type { Block } from "@/entities/block";
import {
  plainTextOfInlineSource,
  sliceInlineSource,
} from "@/shared/lib/text/inlineSource";
import type { BlockDraftCommitReason } from "@/features/block-editor/model/blockDraftStore";
import type { CompleteInput } from "../api/aiClient";
import { readAiSelection, type AiSelection } from "./aiSelection";

/* -------------------------------------------------------------------------- */
/* The shapes                                                                 */
/* -------------------------------------------------------------------------- */

/** What the AI acts on: a block of a page, with the selection when there is one. */
export interface InlineAiTarget {
  pageId: string;
  blockId: string;
  /** The text the user had selected — the AI works on THAT, not on the block. */
  selectionText?: string;
}

/** Where the answer stands. */
export type InlineAiStatus = "idle" | "streaming" | "done" | "error";

/** What "accept" does with the answer. */
export type InlineAiAcceptMode = "replace" | "insert-below";

/**
 * Everything the inline AI needs from the outside.
 *
 * The editor registers its own bundle for the page it owns (see
 * {@link registerInlineAiDeps}); the tests register a fake one.
 */
export interface InlineAiDeps {
  /** `POST /complete` — the service's short-lived completion. */
  complete: (input: CompleteInput, signal?: AbortSignal) => Promise<Response>;
  /** Rewrite a block. */
  updateBlock: (pageId: string, blockId: string, updates: Partial<Block>) => void;
  /** Insert a block right after another one. */
  insertBlock: (pageId: string, afterBlockId: string, block: Block) => void;
  /**
   * Commit the open contentEditable drafts. An open draft would overwrite the
   * AI's text a moment later, so every write flushes first.
   */
  flushPendingDrafts: (reason?: BlockDraftCommitReason) => void;
  /** Markdown → blocks — the paste conversion, never a second markdown parser. */
  markdownToBlocks: (markdown: string) => Block[];
  /**
   * The block's inline source, as the editor has it — or null when this
   * editor does not hold that block (a page can have several editors: the
   * page itself, the cells of a full-page layout).
   */
  getBlockSource: (pageId: string, blockId: string) => string | null;
}

/* -------------------------------------------------------------------------- */
/* The dependencies, per page                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The dependencies, by page.
 *
 * A page can be open in several editors at once — the page itself and the
 * cells of a full-page layout — and each editor owns its own tree. Every
 * editor registers its bundle; the one that HOLDS the block is the one the AI
 * writes through.
 */
const depsByPage = new Map<string, InlineAiDeps[]>();

/** Registers the dependencies the inline AI uses on a page. Returns the unregister. */
export function registerInlineAiDeps(pageId: string, deps: InlineAiDeps): () => void {
  const list = depsByPage.get(pageId) ?? [];
  list.push(deps);
  depsByPage.set(pageId, list);
  return () => {
    const current = depsByPage.get(pageId);
    if (!current) return;
    const at = current.indexOf(deps);
    if (at >= 0) current.splice(at, 1);
    if (current.length === 0) depsByPage.delete(pageId);
  };
}

/** The dependencies of the editor that holds the block (null when none does). */
export function inlineAiDeps(pageId: string, blockId: string): InlineAiDeps | null {
  for (const deps of depsByPage.get(pageId) ?? []) {
    if (deps.getBlockSource(pageId, blockId) !== null) return deps;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* The store                                                                  */
/* -------------------------------------------------------------------------- */

/** The run in flight — one at a time; `stop()` aborts it. */
let activeRun: AbortController | null = null;

/** The code of a failure — the service's own, when it carries one. */
function failureCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "internal";
}

/**
 * The answer, written back over the selection (or over the whole block).
 *
 * The offsets are PLAIN-TEXT offsets — the currency the inline editor uses
 * everywhere — so the text around the selection keeps its formatting.
 */
function answerOverSelection(
  source: string,
  selectionText: string | undefined,
  answer: string,
): string {
  if (!selectionText) return answer;
  const plain = plainTextOfInlineSource(source);
  const at = plain.indexOf(selectionText);
  if (at < 0) return answer;
  const head = sliceInlineSource(source, 0, at);
  const tail = sliceInlineSource(source, at + selectionText.length);
  return `${head}${answer}${tail}`;
}

export interface InlineAiState {
  /** The block the panel acts on — null when the panel is closed. */
  target: InlineAiTarget | null;
  /** The service command the answer comes from (`ask`, `summarize`, …). */
  command: string;
  /** What the user typed — the `$ARGUMENTS` prefix of an `ask`. */
  instruction: string;
  status: InlineAiStatus;
  /** The answer, as it streams in. */
  text: string;
  /** The code of the failure, when there is one. */
  errorCode: string | null;
  /** The id of the run — the idempotency key the service sees. */
  runId: string | null;
  /** The choice the user made in the Assistant — the panel has no picker. */
  selection: AiSelection | null;
  /** Opens the panel on a block. The answer is only asked for by `run`. */
  open: (target: InlineAiTarget, command?: string) => void;
  /** Runs a command on the target. */
  run: (command: string, instruction?: string) => Promise<void>;
  /** Stops the run in flight. */
  stop: () => void;
  /** Writes the answer into the page. Refused while the answer streams. */
  accept: (mode: InlineAiAcceptMode) => boolean;
  /** Throws the answer away. Nothing is written. */
  discard: () => void;
}

export const useInlineAiStore = create<InlineAiState>((set, get) => {
  /** The closed state — every way out of the panel lands here. */
  const closed = {
    target: null,
    command: "",
    instruction: "",
    status: "idle" as InlineAiStatus,
    text: "",
    errorCode: null,
    runId: null,
    selection: null,
  };

  return {
    ...closed,

    open: (target, command) => {
      // The panel has no picker of its own: it speaks with the choice the user
      // made in the Assistant, read when the panel opens.
      set({ ...closed, target, command: command ?? "ask", selection: readAiSelection() });
    },

    run: async (command, instruction) => {
      const target = get().target;
      if (!target) return;
      const deps = inlineAiDeps(target.pageId, target.blockId);
      if (!deps) {
        set({ status: "error", errorCode: "internal" });
        return;
      }

      // The input: the selection when there is one, else the block's own text.
      const source = deps.getBlockSource(target.pageId, target.blockId) ?? "";
      const selected = target.selectionText?.trim();
      const base = selected ? selected : plainTextOfInlineSource(source);
      const asked = instruction?.trim();
      // The instruction is the `$ARGUMENTS` prefix: "translate to French" asks
      // about the text, it does not replace it.
      const inputText = asked ? `${asked}\n${base}` : base;

      const runId = globalThis.crypto.randomUUID();
      const controller = new AbortController();
      activeRun = controller;
      const selection = readAiSelection();
      set({
        command,
        instruction: asked ?? "",
        status: "streaming",
        text: "",
        errorCode: null,
        runId,
        selection,
      });

      try {
        const response = await deps.complete(
          {
            runId,
            command,
            input: { text: inputText },
            ...(selection?.connectionId ? { connectionId: selection.connectionId } : {}),
            ...(selection?.model ? { model: selection.model } : {}),
          },
          controller.signal,
        );
        await pumpSseStream(response, (event, data) => {
          if (event === "text.delta" && typeof data.text === "string") {
            set((state) => ({ text: state.text + data.text }));
            return;
          }
          if (event === "done") {
            set({ status: "done" });
            return;
          }
          if (event === "error") {
            set({
              status: "error",
              errorCode: typeof data.code === "string" ? data.code : "internal",
            });
          }
        });
        // The stream ended without a terminal frame: what arrived is the answer.
        if (get().status === "streaming") set({ status: "done" });
      } catch (error) {
        // A stop is not a failure.
        if (controller.signal.aborted) return;
        set({ status: "error", errorCode: failureCode(error) });
      } finally {
        if (activeRun === controller) activeRun = null;
      }
    },

    stop: () => {
      activeRun?.abort();
      activeRun = null;
      set((state) => (state.status === "streaming" ? { status: "done" } : {}));
    },

    accept: (mode) => {
      const state = get();
      const target = state.target;
      if (!target) return false;
      // Nothing is written while the answer is still arriving.
      if (state.status === "streaming") return false;
      const deps = inlineAiDeps(target.pageId, target.blockId);
      if (!deps) return false;

      const answer = state.text;
      // The open draft would overwrite the AI's text a moment later: commit it first.
      deps.flushPendingDrafts("structural");

      if (mode === "replace") {
        const source = deps.getBlockSource(target.pageId, target.blockId) ?? "";
        deps.updateBlock(target.pageId, target.blockId, {
          content: answerOverSelection(source, target.selectionText, answer),
        });
      } else {
        const blocks = deps.markdownToBlocks(answer);
        let anchor = target.blockId;
        for (const block of blocks) {
          deps.insertBlock(target.pageId, anchor, block);
          anchor = block.id;
        }
      }

      set({ ...closed });
      return true;
    },

    discard: () => {
      activeRun?.abort();
      activeRun = null;
      set({ ...closed });
    },
  };
});
