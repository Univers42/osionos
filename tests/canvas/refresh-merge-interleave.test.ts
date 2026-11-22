// AM15, randomized: local keystrokes and server appends (the AI's add_blocks) interleaved
// with refreshes, saves, and keystrokes or saves landing while a refresh is in flight.
// Seeded, so a failure names the seed that reproduces it. Whatever the order, once the
// client settles the server holds every block either side made, once, with the local text
// last typed.
// Caveat: a sample of interleavings (60 seeds x 40 steps), not all of them; the two sides
// never edit the same block, so this checks loss and duplication, not conflict copies
// (page-version-conflict.test.ts covers those).

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "@/entities/block";
import { createBridge, para, type FakeBridge } from "./page-version.fixtures";
import { PAGE_ID, blockIds, loadPage, openPage, refresh, save, serveReads, textOf, typeLocally } from "./refresh-merge.fixtures";

/** mulberry32: a 32-bit seeded generator, enough to pick among a few operations. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

interface Run {
  bridge: FakeBridge;
  localText: Map<string, string>;
  serverIds: string[];
  copies: number;
  step: number;
}

function typeOne(run: Run, random: () => number): void {
  const content: Block[] = [...(openPage().content ?? [])];
  const own = [...run.localText.keys()];
  if (own.length > 0 && random() < 0.5) {
    const id = own[Math.floor(random() * own.length)];
    const text = `${run.localText.get(id)}+${run.step}`;
    run.localText.set(id, text);
    typeLocally(content.map((block) => (block.id === id ? { ...block, content: text } : block)));
    return;
  }
  const id = `local-${run.step}`;
  run.localText.set(id, `typed ${run.step}`);
  typeLocally([...content, para(id, `typed ${run.step}`)]);
}

function serverAppend(run: Run): void {
  const row = run.bridge.pages.get(PAGE_ID)!;
  const id = `server-${run.step}`;
  run.serverIds.push(id);
  row.content = [...row.content, para(id, `appended ${run.step}`)];
  row.version += 1;
}

async function act(run: Run, random: () => number): Promise<void> {
  const pick = random();
  if (pick < 0.3) return typeOne(run, random);
  if (pick < 0.45) return serverAppend(run);
  if (pick < 0.55) return refresh();
  const pending = pick < 0.85 ? refresh() : null;
  if (pick < 0.7) typeOne(run, random);
  // A save while a refresh is out: its answer comes back older than the 200's base.
  else if (await save(run.bridge)) run.copies += 1;
  await pending;
}

async function play(seed: number): Promise<Run> {
  const bridge = createBridge({ [PAGE_ID]: { version: 1, content: [para("b1", "start")] } });
  serveReads(bridge);
  loadPage([para("b1", "start")], 1, { contentVersion: 1 });
  const run: Run = { bridge, localText: new Map(), serverIds: [], copies: 0, step: 0 };
  const random = seeded(seed);
  for (run.step = 0; run.step < 40; run.step += 1) await act(run, random);
  for (let settle = 0; settle < 3; settle += 1) {
    if (await save(bridge)) run.copies += 1;
    await refresh();
  }
  return run;
}

test("AM15 interleaved: no block from either side is lost or doubled, 60 seeds", async () => {
  for (let seed = 1; seed <= 60; seed += 1) {
    const run = await play(seed);
    const stored = run.bridge.pages.get(PAGE_ID)!.content;
    const ids = blockIds(stored);
    assert.equal(run.copies, 0, `seed ${seed}: no edit went to a copy`);
    assert.equal(new Set(ids).size, ids.length, `seed ${seed}: no block doubled`);
    for (const id of ["b1", ...run.serverIds]) assert.ok(ids.includes(id), `seed ${seed}: server block ${id} kept`);
    for (const [id, text] of run.localText) assert.equal(textOf(stored, id), text, `seed ${seed}: local ${id} kept as typed`);
    assert.deepEqual(openPage().content, stored, `seed ${seed}: the editor shows what the server holds`);
  }
});
