// The Explorer's sections: the sash keeps both usable, and "Open in terminal" types one safe line.
import assert from "node:assert/strict";
import { test } from "node:test";

import { shareWeight } from "../../src/features/ide/ui/ExplorerStack";
import { cdCommand } from "../../src/terminal-client/cdCommand";

test("a sash conserves the shared weight and never closes a section", () => {
  assert.deepEqual(shareWeight(1, 1, 0.5), [1.5, 0.5]);
  const [upper, lower] = shareWeight(1, 1, 5);
  assert.equal(upper + lower, 2);
  assert.ok(lower >= 0.1);
  assert.equal(shareWeight(1, 1, -5)[0], 0.1);
});

test("a folder's name cannot escape the quoted cd", () => {
  assert.equal(cdCommand("/a/b c"), " cd '/a/b c'\n");
  assert.equal(cdCommand("/a'; rm -rf x #"), " cd '/a'\\''; rm -rf x #'\n");
  assert.equal(cdCommand("/a\nrm"), null);
  assert.equal(cdCommand("relative"), null);
});
