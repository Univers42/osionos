/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-inline.test.ts                                  :+:      :+:    :+:   */
/*                                                    Reputation         */
/*   By: dlesieur <dlesieur@student.42.fr>          Reputation         */
/*                                                Reputation           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * "Ask AI" in the editor: the answer streams, NOTHING is written until the
 * user accepts it, and the AI group of the slash menu shows only when the
 * service is configured.
 *
 * The service is a fake: the frames are the ones the contract describes.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { Block } from "@/entities/block";
import { parseMarkdownClipboard } from "@/services/page-actions/blockClipboardSerialize";
import { aiSlashCommands } from "@/features/slash-commands/model/aiSlashCommands";
import {
  registerInlineAiDeps,
  useInlineAiStore,
  type InlineAiDeps,
} from "@/features/ai/model/inlineAiStore";
import type { CompleteInput } from "@/features/ai/api/aiClient";

/* -------------------------------------------------------------------------- */
/* The fake service                                                           */
/* -------------------------------------------------------------------------- */

/** One SSE frame, numbered the way the service numbers them. */
function frame(event: string, data: unknown): string {
  return `id: 1\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A response whose body carries the frames in order, then ends. */
function streamResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const one of frames) controller.enqueue(encoder.encode(one));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

interface Recorded {
  /** Every dependency call, in order — the order IS the contract. */
  calls: string[];
  inputs: CompleteInput[];
  updates: Array<{ pageId: string; blockId: string; updates: Partial<Block> }>;
  inserts: Array<{ pageId: string; afterBlockId: string; block: Block }>;
}

interface FakeOptions {
  /** The frames the service answers with. */
  frames?: string[];
  /** A stream that never ends (until it is aborted) — "still streaming". */
  hold?: boolean;
  /** The block's source, as the editor has it. */
  source?: string;
}

/** The dependencies of a page, with everything they are given recorded. */
function fakeDeps(
  options: FakeOptions = {},
): { deps: InlineAiDeps; recorded: Recorded; register: () => () => void } {
  const recorded: Recorded = { calls: [], inputs: [], updates: [], inserts: [] };
  const deps: InlineAiDeps = {
    complete: async (input, signal) => {
      recorded.calls.push("complete");
      recorded.inputs.push(input);
      if (!options.hold) return streamResponse(options.frames ?? []);
      // A stream that stays open until the run is aborted.
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    },
    updateBlock: (pageId, blockId, updates) => {
      recorded.calls.push("updateBlock");
      recorded.updates.push({ pageId, blockId, updates });
    },
    insertBlock: (pageId, afterBlockId, block) => {
      recorded.calls.push("insertBlock");
      recorded.inserts.push({ pageId, afterBlockId, block });
    },
    flushPendingDrafts: () => {
      recorded.calls.push("flushPendingDrafts");
    },
    // The REAL conversion: the answer becomes blocks the way a paste does.
    markdownToBlocks: parseMarkdownClipboard,
    getBlockSource: () => options.source ?? "The block text.",
  };
  return { deps, recorded, register: () => registerInlineAiDeps(PAGE, deps) };
}

/** The dependencies of the page under test, registered for this test only. */
function useDeps(
  t: { after: (fn: () => void) => void },
  options: FakeOptions = {},
): { deps: InlineAiDeps; recorded: Recorded } {
  const fake = fakeDeps(options);
  const unregister = fake.register();
  t.after(unregister);
  return { deps: fake.deps, recorded: fake.recorded };
}

/** Waits for the store to settle (the stream is pumped off the event loop). */
async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("the store never settled");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const PAGE = "page-1";
const BLOCK = "block-1";

/* -------------------------------------------------------------------------- */
/* The tests                                                                  */
/* -------------------------------------------------------------------------- */

test("the answer streams into the panel, and nothing is written yet", async (t) => {
  const { recorded } = useDeps(t, {
    frames: [
      frame("text.delta", { text: "Hel" }),
      frame("text.delta", { text: "lo" }),
      frame("done", { runId: "run-1" }),
    ],
  });
  useInlineAiStore.getState().open({ pageId: PAGE, blockId: BLOCK });
  await useInlineAiStore.getState().run("summarize");
  await waitFor(() => useInlineAiStore.getState().status === "done");

  const state = useInlineAiStore.getState();
  assert.equal(state.text, "Hello", "the deltas are appended in order");
  assert.equal(state.status, "done");
  assert.equal(recorded.calls.includes("updateBlock"), false, "nothing is written before the user accepts");
  assert.equal(recorded.calls.includes("insertBlock"), false);
  assert.equal(recorded.inputs[0].command, "summarize");
  assert.equal(recorded.inputs[0].input.text, "The block text.", "the input is the block's own text");
  assert.ok(recorded.inputs[0].runId, "the run carries its own id");
});

test("accepting an answer flushes the open drafts and THEN writes the text", async (t) => {
  const { recorded } = useDeps(t, {
    frames: [frame("text.delta", { text: "A new line." }), frame("done", {})],
  });
  useInlineAiStore.getState().open({ pageId: PAGE, blockId: BLOCK });
  await useInlineAiStore.getState().run("improve");
  await waitFor(() => useInlineAiStore.getState().status === "done");

  const accepted = useInlineAiStore.getState().accept("replace");
  assert.equal(accepted, true);
  assert.deepEqual(
    recorded.calls,
    ["complete", "flushPendingDrafts", "updateBlock"],
    "the draft is committed BEFORE the AI text is written",
  );
  assert.equal(recorded.updates.length, 1);
  assert.equal(recorded.updates[0].pageId, PAGE);
  assert.equal(recorded.updates[0].blockId, BLOCK);
  assert.equal(recorded.updates[0].updates.content, "A new line.");
  assert.equal(useInlineAiStore.getState().target, null, "the panel closes once the answer is in");
});

test("inserting below turns a multi-paragraph answer into blocks", async (t) => {
  const { recorded } = useDeps(t, {
    frames: [
      frame("text.delta", { text: "First paragraph.\n\nSecond paragraph." }),
      frame("done", {}),
    ],
  });
  useInlineAiStore.getState().open({ pageId: PAGE, blockId: BLOCK });
  await useInlineAiStore.getState().run("continue");
  await waitFor(() => useInlineAiStore.getState().status === "done");

  assert.equal(useInlineAiStore.getState().accept("insert-below"), true);
  assert.equal(recorded.inserts.length, 2, "one block per paragraph");
  assert.equal(recorded.inserts[0].afterBlockId, BLOCK, "the first block lands under the target");
  assert.equal(recorded.inserts[0].block.type, "paragraph");
  assert.equal(recorded.inserts[0].block.content, "First paragraph.");
  assert.equal(recorded.inserts[1].afterBlockId, recorded.inserts[0].block.id, "the second one follows the first");
  assert.equal(recorded.inserts[1].block.content, "Second paragraph.");
  assert.equal(recorded.updates.length, 0, "inserting does not rewrite the target");
});

test("an answer that is still streaming cannot be accepted, and discarding writes nothing", async (t) => {
  const { recorded } = useDeps(t, { hold: true });
  useInlineAiStore.getState().open({ pageId: PAGE, blockId: BLOCK });
  void useInlineAiStore.getState().run("summarize");
  await waitFor(() => useInlineAiStore.getState().status === "streaming");

  assert.equal(useInlineAiStore.getState().accept("replace"), false, "accepting is refused while it streams");
  assert.equal(useInlineAiStore.getState().accept("insert-below"), false);
  assert.equal(recorded.updates.length, 0);
  assert.equal(recorded.inserts.length, 0);

  useInlineAiStore.getState().discard();
  assert.equal(recorded.calls.includes("updateBlock"), false, "discarding writes nothing");
  assert.equal(recorded.calls.includes("insertBlock"), false);
  assert.equal(useInlineAiStore.getState().target, null);
  assert.equal(useInlineAiStore.getState().status, "idle");
});

test("an error frame fails the answer with its code, and Retry asks the same question again", async (t) => {
  const { recorded } = useDeps(t, {
    frames: [
      frame("text.delta", { text: "partial" }),
      frame("error", { code: "upstream_error", message: "the provider is down" }),
    ],
  });
  useInlineAiStore.getState().open({ pageId: PAGE, blockId: BLOCK });
  await useInlineAiStore.getState().run("summarize");
  await waitFor(() => useInlineAiStore.getState().status === "error");

  const failed = useInlineAiStore.getState();
  assert.equal(failed.errorCode, "upstream_error");

  // Retry: the same command, the same input.
  await useInlineAiStore.getState().run(failed.command, failed.instruction || undefined);
  await waitFor(() => recorded.inputs.length === 2);
  assert.equal(recorded.inputs[1].command, recorded.inputs[0].command);
  assert.deepEqual(recorded.inputs[1].input, recorded.inputs[0].input);
  assert.notEqual(recorded.inputs[1].runId, recorded.inputs[0].runId, "a retry is a new run");
});

test("with two editors on the page, the AI writes through the one that holds the block", async (t) => {
  // A full-page layout has several editors for one page: the page itself and
  // the cells. Only the editor that HOLDS the block may write it.
  const holder = fakeDeps({ source: "The cell block." });
  const other = fakeDeps({ source: "The page block." });
  const unregisterOther = registerInlineAiDeps(PAGE, {
    ...other.deps,
    getBlockSource: () => null,
  });
  const unregisterHolder = registerInlineAiDeps(PAGE, holder.deps);
  t.after(() => {
    unregisterOther();
    unregisterHolder();
  });

  useInlineAiStore.getState().open({ pageId: PAGE, blockId: BLOCK });
  await useInlineAiStore.getState().run("summarize");
  await waitFor(() => useInlineAiStore.getState().status === "done");
  useInlineAiStore.getState().accept("replace");

  assert.equal(holder.recorded.updates.length, 1, "the editor that holds the block wrote it");
  assert.equal(other.recorded.updates.length, 0, "the other editor was not touched");
  assert.equal(holder.recorded.inputs[0].input.text, "The cell block.");
});

test("the AI group of the slash menu appears only when the service is configured", () => {
  assert.deepEqual(aiSlashCommands(false), [], "no service, no AI action");

  const withAi = aiSlashCommands(true);
  assert.equal(withAi.length, 11, "one entry per editor command of the service, and the dictation");
  const commands = withAi.filter((entry) => entry.kind === "ai");
  assert.deepEqual(
    commands.map((entry) => entry.command),
    ["ask", "summarize", "continue", "improve", "fix", "shorter", "longer", "translate", "action-items", "explain"],
  );
  // The dictation is NOT a command of the service: it writes at the caret.
  const dictate = withAi.find((entry) => entry.kind === "dictate");
  assert.ok(dictate, "the dictation is in the group");
  assert.equal(dictate.label, "Dictate");
  assert.ok(withAi.every((entry) => entry.section === "ai"));
  assert.deepEqual(
    withAi.map((entry) => entry.label),
    [
      "Ask AI",
      "Summarize",
      "Continue writing",
      "Improve writing",
      "Fix spelling & grammar",
      "Make shorter",
      "Make longer",
      "Translate",
      "Action items",
      "Dictate",
      "Explain",
    ],
  );
});

// The catalog holds JSX, so the wiring is read as text — the same way the
// whiteboard catalog is checked.
test("the slash catalog gates the AI group on the service being configured", () => {
  const source = readFileSync(
    new URL("../../src/features/slash-commands/model/slashMenuCatalog.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /import \{ isAiConfigured \} from "@\/features\/ai\/api\/aiClient"/);
  assert.match(source, /aiSlashCommands\(isAiConfigured\(\), isAiImagesEnabled\(\)\)/);
});
