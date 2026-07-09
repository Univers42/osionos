/* ************************************************************************** */
/*  marquee-embed-guard.test.ts — the marquee never starts on an embed block  */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { EMBED_BLOCK_TYPES } from "../../src/features/block-editor/model/marqueeGeometry.ts";
import {
  getBlockCategory,
  isParentable,
  isListBlock,
  isHeadingBlock,
  selfRendersChildren,
  enterCreatesChild,
} from "../../src/entities/block/model/blockCategories.ts";

// A page marquee (rubber-band select) may begin from background/whitespace but
// NOT on top of a block that renders its own interactive content — databases,
// media, graph, tables, buttons, code/equation. isInteractiveSelectionTarget
// bails on `[data-block-type="…"]` for exactly EMBED_BLOCK_TYPES, so if that
// list drifts from the atomic/embed blocks in blockCategories.ts the "marquee
// hijacks the database" regression comes back. These tests pin the list.

test("EMBED_BLOCK_TYPES has no duplicates", () => {
  assert.equal(new Set(EMBED_BLOCK_TYPES).size, EMBED_BLOCK_TYPES.length);
});

test("every embed type is a real, atomic block in the category registry", () => {
  for (const type of EMBED_BLOCK_TYPES) {
    // Registered block type (a rename/removal would make this undefined).
    assert.ok(getBlockCategory(type), `${type} is not a registered block type`);
    // Atomic embed: not a text container/list/heading that holds selectable
    // children — those must stay marquee-startable from their gaps.
    assert.equal(isParentable(type), false, `${type} is parentable`);
    assert.equal(isListBlock(type), false, `${type} is a list block`);
    assert.equal(isHeadingBlock(type), false, `${type} is a heading block`);
    assert.equal(selfRendersChildren(type), false, `${type} self-renders children`);
    assert.equal(enterCreatesChild(type), false, `${type} is a container`);
  }
});

test("the databases the user reported are covered", () => {
  // The originating bug: pressing inside a database block started a marquee.
  assert.ok(EMBED_BLOCK_TYPES.includes("database_inline"));
  assert.ok(EMBED_BLOCK_TYPES.includes("database_full_page"));
});
