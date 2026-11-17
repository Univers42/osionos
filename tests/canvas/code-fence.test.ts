import assert from "node:assert/strict";
import test from "node:test";

import { fenceFor } from "../../src/shared/lib/markdown/codeFence.ts";

test("fenceFor: no backticks and empty input get the 3-backtick minimum", () => {
  assert.equal(fenceFor(""), "```");
  assert.equal(fenceFor("plain"), "```");
  assert.equal(fenceFor("a `b` ``c``"), "```");
});

test("fenceFor: one longer than the longest run", () => {
  assert.equal(fenceFor("```"), "````");
  assert.equal(fenceFor("`".repeat(7)), "`".repeat(8));
});

test("fenceFor: runs count at line start and mid-line", () => {
  assert.equal(fenceFor("x\n````ts\ny"), "`````");
  assert.equal(fenceFor("say ````` here"), "``````");
});
