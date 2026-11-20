// ADR 0064 PS41: columns and style may add at most 200 bytes per added node to a published copy,
// and MAX_NODES / MAX_DEPTH stay put. Every shell's snapshot size is printed so a regression is
// read off the output, not guessed.
// Caveat: bytes are JSON.stringify length (UTF-8 of ASCII-heavy ids and keys); the stored row
// adds the database's own overhead, which this does not measure.
import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error plain .mjs, no declaration file
import { publishSnapshot } from "../../scripts/bridge-publish-snapshot.mjs";
import { loadTemplate } from "../../src/data/templates/catalogue/index.ts";
import { SHELLS } from "../../src/data/templates/catalogue/shells/shellIndex.ts";

const BUDGET = 200;
const size = (value: unknown): number => JSON.stringify(value).length;
const count = (nodes: { children?: unknown[] }[]): number =>
  nodes.reduce((sum, node) => sum + 1 + count((node.children ?? []) as never), 0);

const rows: string[] = [];
let worstPerNode = 0;

for (const { id } of SHELLS) {
  test(`shell ${id}: published size and added bytes per added node`, async () => {
    const blocks = (await loadTemplate(`tpl:${id}`))?.content;
    assert.ok(blocks);
    const before = publishSnapshot(blocks);
    const after = publishSnapshot(blocks, { containers: true });
    const addedNodes = count(after) - count(before);
    const perNode = addedNodes > 0 ? (size(after) - size(before)) / addedNodes : 0;
    worstPerNode = Math.max(worstPerNode, perNode);
    rows.push(`${id.padEnd(16)} before ${String(size(before)).padStart(6)} after ${String(size(after)).padStart(6)} nodes+${addedNodes} bytes/node ${perNode.toFixed(1)}`);
    assert.ok(perNode <= BUDGET, `${id}: ${perNode.toFixed(1)} bytes per added node`);
  });
}

test("the full style of one node adds at most 200 bytes", () => {
  const full = { padding: 12, paddingX: 12, paddingY: 12, gap: 12, layout: "grid", cols: 6, minCol: 20, stackAt: "mobile", surface: "muted", radius: "panel" };
  const plain = [{ id: "0123456789abcdef0123456789abcdef", type: "paragraph", content: "x" }];
  const styled = [{ ...plain[0], style: full }];
  const added = size(publishSnapshot(styled, { containers: true })) - size(publishSnapshot(plain, { containers: true }));
  console.log(`full style of one node: +${added} bytes`);
  assert.ok(added <= BUDGET, `${added} bytes`);
});

test("size report", () => {
  console.log(`${SHELLS.length} shells, worst ${worstPerNode.toFixed(1)} bytes per added node\n${rows.join("\n")}`);
  assert.equal(rows.length, SHELLS.length);
});
