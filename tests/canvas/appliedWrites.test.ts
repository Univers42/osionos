// AM19/AM8 in the chat: the row of a write an auto mode applied, Undo, the turn bar
// and the reason on a card. Every new element is behind `osio.ai.modes`.
// Caveat: the card reasons are checked against types.ts of the service by regex, so a
// union written another way fails loudly here (red), never silently (green).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import "./support/memory-local-storage.ts";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { setAiTransport } from "@/features/ai/api/aiClient";
import { assistantTurn, type TurnStore } from "@/features/chat/model/assistantTurn";
import { dispatchRunEvent } from "@/features/chat/model/runEventDispatch";
import { appliedFromEvent, undoErrorText, useAppliedWrites } from "@/features/chat/model/appliedWrites";
import { CARD_REASONS, cardReasonText } from "@/features/chat/model/cardReason";
import type { ChatMessage } from "@/features/chat/model/chatTypes";
import { ApprovalCard } from "@/features/chat/ui/ApprovalCard";
import { permissionFromEvent } from "@/features/chat/model/approvalParts";
import { AppliedWrites } from "@/features/chat/ui/AppliedWrites";
import { AppliedWriteRow } from "@/features/chat/ui/AppliedWriteRow";
import { TurnUndoBar } from "@/features/chat/ui/TurnUndoBar";

const EVENT = { approvalId: "a1", tool: "add_blocks", target: "p1", summary: "Added 2 blocks to Plan", decidedBy: "auto:auto", undoable: true };
const view = (extra = {}) => ({ ...EVENT, undoneAt: null, undoUntil: new Date(Date.now() + 86_400_000).toISOString(), ...extra });

/** Runs `fn` with `osio.ai.modes` on, then puts the flag back off. */
function withFlag<T>(on: boolean, fn: () => T): T {
  if (on) {
    globalThis.localStorage.setItem("osio.ai.modes", "1");
    Object.assign(globalThis, { window: { localStorage: globalThis.localStorage } });
  }
  try {
    return fn();
  } finally {
    delete (globalThis as { window?: unknown }).window;
    globalThis.localStorage.removeItem("osio.ai.modes");
  }
}

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const noop = () => undefined;
const reset = () => useAppliedWrites.setState({ rows: [] });

test("every card reason of the service has words, and the list is the service's list", () => {
  const source = readFileSync("services/osionos-ai/src/approvals/types.ts", "utf8");
  const union = /export type CardReason =([^;]+);/.exec(source)?.[1] ?? "";
  const server = [...union.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(server.length >= 16);
  assert.deepEqual([...CARD_REASONS].sort(), [...server].sort());
  withFlag(true, () => {
    for (const reason of server) assert.ok(cardReasonText(reason), reason);
    assert.equal(cardReasonText("tainted"), "Automatic edits are off for this conversation: it read content other people can write.");
    assert.equal(cardReasonText(undefined), null);
    assert.equal(cardReasonText("from_the_future"), null);
  });
  assert.equal(withFlag(false, () => cardReasonText("tainted")), null);
});

test("a write.applied event reaches the store through the turn, bound to its message and run", () => {
  reset();
  const messages: ChatMessage[] = [{ id: "m1", conversationId: "c1", role: "assistant", content: "", runId: "run-1" } as ChatMessage];
  const store = { messages: () => messages, addMessage: noop, patchMessage: noop, conversationTitle: () => "", writeTitle: noop, noteTruncated: noop } as unknown as TurnStore;
  dispatchRunEvent("write.applied", { ...EVENT }, assistantTurn(store, "m1", "c1"));
  dispatchRunEvent("write.applied", { type: "write.applied" }, assistantTurn(store, "m1", "c1"));
  const rows = useAppliedWrites.getState().rows;
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].approvalId, rows[0].messageId, rows[0].runId, rows[0].summary], ["a1", "m1", "run-1", EVENT.summary]);
  assert.equal(appliedFromEvent({ approvalId: 3 }), null);
});

test("the applied row says what happened, offers Undo and the window", () => {
  const out = html(React.createElement(AppliedWriteRow, { row: { ...view(), messageId: "m1", runId: "r1", undoable: true, busy: false, error: "" }, onUndo: noop }));
  assert.match(out, /Added 2 blocks to Plan/);
  assert.match(out, /<button[^>]*>Undo<\/button>/);
  assert.match(out, /Applied automatically \(auto\)/);
  assert.match(out, /Undo is available for 7 days/);
});

test("an undone row says Undone and has no button", () => {
  const out = html(React.createElement(AppliedWriteRow, { row: { ...view({ undoneAt: new Date().toISOString() }), messageId: "m1", runId: "r1", undoable: true, busy: false, error: "" }, onUndo: noop }));
  assert.match(out, /Undone/);
  assert.doesNotMatch(out, /<button/);
});

test("a refused undo shows its words", () => {
  assert.equal(undoErrorText("changed_since"), "Not undone: the page changed since.");
  assert.ok(undoErrorText("anything_else"));
  const row = { ...view(), messageId: "m1", runId: "r1", undoable: true, busy: false, error: undoErrorText("changed_since") };
  assert.match(html(React.createElement(AppliedWriteRow, { row, onUndo: noop })), /Not undone: the page changed since\./);
});

test("the turn bar offers Undo all from two undoable rows, not from one", () => {
  assert.match(html(React.createElement(TurnUndoBar, { count: 2, busy: false, error: "", onUndoAll: noop })), />Undo all</);
  assert.equal(html(React.createElement(TurnUndoBar, { count: 1, busy: false, error: "", onUndoAll: noop })), "");
});

test("the flag gates every new element: rows render only when osio.ai.modes is on", () => {
  const rows = ["a1", "a2"].map((approvalId) => ({ ...view({ approvalId }), messageId: "m1", runId: "r1", undoable: true, busy: false, error: "" }));
  const node = () => React.createElement(AppliedWrites, { messageId: "m1", runId: "r1" });
  Object.assign(useAppliedWrites.getInitialState(), { rows });
  try {
    assert.equal(withFlag(false, () => html(node())), "");
    const on = withFlag(true, () => html(node()));
    assert.match(on, /Undo all/);
    assert.equal((on.match(/>Undo<\/button>/g) ?? []).length, 2);
    assert.equal(withFlag(true, () => html(React.createElement(AppliedWrites, { messageId: "other", runId: "other" }))), "");
  } finally {
    Object.assign(useAppliedWrites.getInitialState(), { rows: [] });
  }
});

test("undo and undo-all call the service and settle the rows", async () => {
  reset();
  const calls: string[] = [];
  const add = (id: string) => useAppliedWrites.getState().add({ ...EVENT, approvalId: id }, { messageId: "m1", runId: "r1" });
  add("a1");
  add("a2");
  setAiTransport(async (url, init) => {
    calls.push(`${init?.method} ${String(url).replace(/^.*\/api\/ai/, "")}`);
    return String(url).endsWith("/undo") && String(url).includes("a2")
      ? Response.json({ error: "changed_since" }, { status: 409 })
      : Response.json({ ok: true });
  });
  await useAppliedWrites.getState().undo("a1");
  await useAppliedWrites.getState().undo("a2");
  const [a1, a2] = useAppliedWrites.getState().rows;
  assert.ok(a1.undoneAt);
  assert.equal(a2.undoneAt, null);
  assert.equal(a2.error, "Not undone: the page changed since.");
  await useAppliedWrites.getState().undoTurn("r1");
  assert.ok(useAppliedWrites.getState().rows.every((r) => r.undoneAt));
  assert.ok(calls.includes("POST /approvals/a1/undo") && calls.includes("POST /runs/r1/undo-writes"), calls.join("|"));
});

test("the card shows its reason only with the flag on, and the frame carries it", () => {
  const card = () => html(React.createElement(ApprovalCard, { approvalId: "a9", cardReason: "tainted" }));
  assert.doesNotMatch(withFlag(false, card), /Automatic edits are off/);
  assert.match(withFlag(true, card), /Automatic edits are off for this conversation/);
  assert.equal(permissionFromEvent({ approvalId: "a9", tool: "add_blocks", cardReason: "tainted" })?.cardReason, "tainted");
});
