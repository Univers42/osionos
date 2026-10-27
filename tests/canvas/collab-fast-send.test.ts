/**
 * Fast send (collabFastSend): the draft tap, the sender that turns a draft
 * into one realtime-only put, its corrective put when the draft settles on
 * other text, and convergence when puts arrive out of order.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "../../src/entities/block/model/types.ts";
import {
  applyBlockOps,
  nextBlockClock,
  type BlockDiffOp,
  type BlockOp,
} from "../../src/features/collab/model/blockSync.ts";
import { createFastSender, type DraftTap } from "../../src/features/collab/model/fastSend.ts";
import {
  commitBlockDraft,
  setBlockDraft,
  setBlockDraftCommitter,
  subscribeDraftTap,
  type DraftTapEvent,
} from "../../src/features/block-editor/model/blockDraftStore.ts";

const PAGE = "page-1";
const SOURCE = `page:${PAGE}`;

function paragraph(id: string, content: string): Block {
  return { id, type: "paragraph", content };
}

function harness(initial: string, throttle: { minGapMs: number; now?: () => number } = { minGapMs: 0 }) {
  let tree: Block[] = [paragraph("b1", initial), paragraph("b2", "other")];
  const emitted: BlockDiffOp[][] = [];
  const edits: string[] = [];
  const sender = createFastSender({
    pageId: PAGE,
    readContent: () => tree,
    emit: (ops) => emitted.push(ops),
    markLocalEdit: (id) => edits.push(id),
    ...throttle,
  });
  const tap = (kind: DraftTap["kind"], content: string | null, blockId = "b1", sourceKey = SOURCE) =>
    sender.onTap({ kind, sourceKey, blockId, content });
  return { tap, emitted, edits, dispose: () => sender.dispose(), setStore: (text: string) => { tree = [paragraph("b1", text), paragraph("b2", "other")]; } };
}

const putText = (ops: BlockDiffOp[]) => (ops[0] as { block: { content: string } }).block.content;

test("draft store tap: listener sees draft and settle; zero listeners change nothing", () => {
  const seen: DraftTapEvent[] = [];
  const committed: string[] = [];
  const stopCommitter = setBlockDraftCommitter("page:tap", (_id, text) => committed.push(text));

  setBlockDraft("page:tap", "b1", "a", "ab");
  assert.equal(commitBlockDraft("page:tap", "b1", "idle"), true, "no listener: commit behaves as before");
  assert.deepEqual(committed, ["ab"]);

  const stop = subscribeDraftTap((event) => seen.push(event));
  setBlockDraft("page:tap", "b1", "ab", "abc");
  commitBlockDraft("page:tap", "b1", "idle");
  stop();
  setBlockDraft("page:tap", "b1", "abc", "abcd");
  commitBlockDraft("page:tap", "b1", "idle");
  stopCommitter();

  assert.deepEqual(seen.map((event) => [event.kind, event.content]), [["draft", "abc"], ["settled", "abc"]]);
});

test("fast sender: a draft leaves as exactly one put carrying the draft text, and stamps the edit", () => {
  const { tap, emitted, edits } = harness("hello");
  tap("draft", "hello!");
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0]?.length, 1);
  assert.equal(emitted[0]?.[0]?.k, "put");
  assert.equal(putText(emitted[0] as BlockDiffOp[]), "hello!");
  assert.deepEqual(edits, ["b1"], "lastLocalEdit is stamped at draft time");
});

test("fast sender: dedupes identical text, other pages, unknown blocks and no-op drafts", () => {
  const { tap, emitted } = harness("hello");
  tap("draft", "hello!");
  tap("draft", "hello!");
  tap("draft", "hello", "b1", "page:other");
  tap("draft", "zzz", "missing");
  const { tap: tapSame, emitted: none } = harness("same");
  tapSame("draft", "same");
  assert.equal(emitted.length, 1);
  assert.equal(none.length, 0, "draft equal to the document sends nothing");
});

test("fast sender: undo/cancel/idle that ends on different text emits one corrective put", () => {
  const undo = harness("hello");
  undo.tap("draft", "hello!");
  undo.setStore("hello");
  undo.tap("settled", "hello");
  assert.equal(undo.emitted.length, 2);
  assert.equal(putText(undo.emitted[1] as BlockDiffOp[]), "hello", "undo restores the committed text on peers");

  const cancel = harness("hello");
  cancel.tap("draft", "hello!");
  cancel.tap("settled", null); // store still holds "hello"
  assert.equal(putText(cancel.emitted[1] as BlockDiffOp[]), "hello", "cancel reads the document text");

  const idle = harness("hello");
  idle.tap("draft", "hello!");
  idle.setStore("hello!");
  idle.tap("settled", "hello!");
  assert.equal(idle.emitted.length, 1, "commit on the sent text needs no correction");
  idle.tap("settled", "hello!");
  assert.equal(idle.emitted.length, 1, "a settle with nothing sent is silent");
});

test("out-of-order puts converge by Lamport version (seeded property)", () => {
  let seed = 0x9e3779b9;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let round = 0; round < 200; round += 1) {
    const ops: Array<{ op: BlockOp; actor: string }> = [];
    const count = 2 + Math.floor(random() * 8);
    for (let index = 0; index < count; index += 1) {
      const actor = random() < 0.5 ? "a:1" : "b:1";
      ops.push({ actor, op: { k: "put", id: "b1", parentId: null, block: { id: "b1", type: "paragraph", content: `t${round}-${index}` }, v: nextBlockClock() } });
    }
    const finals = [0, 1, 2].map(() => {
      const order = [...ops].sort(() => random() - 0.5);
      let blocks: Block[] | undefined = [paragraph("b1", "start")];
      let registers = {};
      for (const { op, actor } of order) {
        const result = applyBlockOps(blocks, [op], actor, registers);
        blocks = result.blocks;
        registers = result.registers;
      }
      return blocks?.[0]?.content;
    });
    const newest = ops.reduce((best, current) => (current.op.v > best.op.v ? current : best));
    const expected = (newest.op as { block: { content: string } }).block.content;
    assert.deepEqual(finals, [expected, expected, expected], `round ${round}: every order ends on the highest version`);
  }
});

test("fast sender throttle: a burst sends the first draft at once and one trailing put with the latest text", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let clock = 0;
  const h = harness("", { minGapMs: 33, now: () => clock });
  const burst = "abcdefghijklmnopqrstuvwxyz";
  for (let i = 1; i <= burst.length; i++) { h.tap("draft", burst.slice(0, i)); clock += 1; t.mock.timers.tick(1); }
  assert.equal(h.emitted.length, 1, "inside the gap only the first keystroke leaves");
  t.mock.timers.tick(33);
  assert.equal(h.emitted.length, 2);
  assert.equal(putText(h.emitted[1] as BlockDiffOp[]), burst, "the trailing put carries the last draft");
  t.mock.timers.tick(1000);
  assert.equal(h.emitted.length, 2, "nothing more once the burst has drained");
});

test("fast sender throttle: keystrokes slower than the gap each leave immediately", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let clock = 0;
  const h = harness("", { minGapMs: 33, now: () => clock });
  for (const text of ["a", "ab", "abc"]) { h.tap("draft", text); clock += 120; t.mock.timers.tick(120); }
  assert.deepEqual(h.emitted.map((ops) => putText(ops)), ["a", "ab", "abc"]);
});

test("fast sender throttle: settle and dispose cancel the trailing put; settle still corrects", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let clock = 0;
  const settled = harness("", { minGapMs: 33, now: () => clock });
  settled.tap("draft", "a");
  settled.tap("draft", "ab");
  settled.setStore("abc");
  settled.tap("settled", "abc");
  t.mock.timers.tick(100);
  assert.deepEqual(settled.emitted.map((ops) => putText(ops)), ["a", "abc"], "the settle sends the final text, the stale trailing put never fires");

  const cancelled = harness("x", { minGapMs: 33, now: () => clock });
  cancelled.tap("draft", "xy");
  cancelled.tap("draft", "xyz");
  cancelled.tap("settled", null);
  t.mock.timers.tick(100);
  assert.deepEqual(cancelled.emitted.map((ops) => putText(ops)), ["xy", "x"], "cancel restores the document text, not the pending draft");

  const left = harness("", { minGapMs: 33, now: () => clock });
  left.tap("draft", "a");
  left.tap("draft", "ab");
  left.dispose();
  t.mock.timers.tick(100);
  assert.equal(left.emitted.length, 1, "leaving the page drops the pending put");
});

test("fast sender throttle: a draft back to the sent text clears a pending put", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let clock = 0;
  const h = harness("", { minGapMs: 33, now: () => clock });
  h.tap("draft", "a");
  h.tap("draft", "ab");
  h.tap("draft", "a");
  t.mock.timers.tick(100);
  assert.equal(h.emitted.length, 1, "peers already hold 'a'; no trailing put");
});
