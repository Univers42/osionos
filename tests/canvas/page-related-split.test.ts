import assert from "node:assert/strict";
import { test } from "node:test";
import { splitRelatedPages } from "../../src/entities/page/model/splitRelatedPages.ts";

// #261: "Related pages" listed every neighbour and "Suggested links" the
// unlinked ones, so an unlinked page filled both rows with the same list.
test("a page appears in exactly one of the two rows", () => {
  const { related, suggestions } = splitRelatedPages([
    { pageId: "a", title: "A", linked: true },
    { pageId: "b", title: "B", linked: false },
  ]);
  assert.deepEqual(related.map((page) => page.pageId), ["a"]);
  assert.deepEqual(suggestions.map((page) => page.pageId), ["b"]);
});

test("nothing linked leaves only the suggestions", () => {
  assert.equal(splitRelatedPages([{ pageId: "b", title: "B", linked: false }]).related.length, 0);
});
