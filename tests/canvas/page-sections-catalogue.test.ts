// Every section of the library is shallow enough (PS17), survives both page formats
// unchanged (PS21) and carries no cover-layout field (CV15).

import assert from "node:assert/strict";
import test from "node:test";

import { SECTIONS, buildSection } from "../../src/data/templates/sections/sectionIndex.ts";
import { SECTION_BUILDERS } from "../../src/data/templates/sections/sectionBuilders.ts";
import { attributeRoundTrip, blockDepth, coverLayoutKeysIn, fileRoundTrip, layoutProjection, markdownProjection, markdownRoundTrip } from "./support/catalogue-checks.ts";

test("the index and the builders name the same twenty sections", () => {
  assert.deepEqual(SECTIONS.map((section) => section.id).sort(), Object.keys(SECTION_BUILDERS).sort());
  assert.equal(SECTIONS.length, 20);
});

for (const { id } of SECTIONS) {
  test(`section ${id}: depth ≤ 8, both round trips unchanged, no cover-layout key`, async () => {
    const blocks = await buildSection(id);
    assert.ok(blocks && blocks.length > 0, `${id} builds blocks`);
    assert.ok(blockDepth(blocks) <= 8, `${id} depth ${blockDepth(blocks)}`);
    assert.deepEqual(markdownProjection(markdownRoundTrip(blocks)), markdownProjection(blocks), `${id} markdown`);
    assert.deepEqual(fileRoundTrip(blocks), blocks, `${id} .omd`);
    assert.deepEqual(layoutProjection(attributeRoundTrip(blocks)), layoutProjection(blocks), `${id} layout attributes`);
    assert.deepEqual(coverLayoutKeysIn(blocks), []);
  });
}

test("each build is fresh: no block id is shared between two calls", async () => {
  const ids = (blocks: unknown): string[] => JSON.stringify(blocks).match(/"id":"[^"]+"/g) ?? [];
  const first = new Set(ids(await buildSection("hero")));
  assert.ok(ids(await buildSection("hero")).every((id) => !first.has(id)));
});

test("an unknown section builds nothing", async () => {
  assert.equal(await buildSection("no-such-section"), null);
});
