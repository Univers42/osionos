import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Caveat: slashMenuCatalog.tsx holds JSX, which node's type stripping cannot load, so this
// reads the file as text. A catalog entry rebuilt by a helper or spread from another file
// would not be seen (the scan would then fail loudly on a missing entry, never pass
// silently). `/draw` not matching and `/white` matching are asserted in the browser by
// tests/e2e/functional/whiteboardBlock.spec.mjs.
const catalogSource = readFileSync(new URL("../../src/features/slash-commands/model/slashMenuCatalog.tsx", import.meta.url), "utf8");

function whiteboardEntry(): string {
  const match = /^ {2}\{\n {4}id: "advanced:whiteboard",\n[\s\S]*?\n {2}\},$/m.exec(catalogSource);
  assert.ok(match, "the advanced:whiteboard catalog entry was not found");
  return match[0];
}

test("/whiteboard is the only way to create a board: the entry has no alias", () => {
  assert.doesNotMatch(whiteboardEntry(), /aliases\s*:/);
});

test("no catalog entry lists draw as an alias", () => {
  assert.doesNotMatch(catalogSource, /aliases\s*:\s*\[[^\]]*["'`]draw["'`]/i);
});

test("the description does not advertise /draw", () => {
  const description = /description:\s*"([^"]*)"/.exec(whiteboardEntry());
  assert.ok(description, "the whiteboard entry has a description");
  assert.doesNotMatch(description[1], /draw/i);
  assert.match(description[1], /\/whiteboard/);
});

test("the entry still names its app so requiresApp can hide it", () => {
  const entry = whiteboardEntry();
  assert.match(entry, /kind: "whiteboard"/);
  assert.match(entry, /label: "Whiteboard"/);
  assert.match(entry, /requiresApp: "osionos\.whiteboard"/);
});
