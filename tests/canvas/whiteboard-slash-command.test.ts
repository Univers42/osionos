import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Caveat: slashMenuCatalog.tsx holds JSX, which node's type stripping cannot load, so this
// reads the file as text. A catalog entry rebuilt by a helper or spread from another file
// would not be seen (the scan would then fail loudly on a missing entry, never pass
// silently). `/draw` and `/white` matching are asserted in the browser by
// tests/e2e/functional/whiteboardBlock.spec.mjs.
const catalogSource = readFileSync(new URL("../../src/features/slash-commands/model/slashMenuCatalog.tsx", import.meta.url), "utf8");

function whiteboardEntry(): string {
  const match = /^ {2}\{\n {4}id: "advanced:whiteboard",\n[\s\S]*?\n {2}\},$/m.exec(catalogSource);
  assert.ok(match, "the advanced:whiteboard catalog entry was not found");
  return match[0];
}

test("/whiteboard is also found by the search words draw and drawing", () => {
  const aliases = /aliases\s*:\s*\[([^\]]*)\]/.exec(whiteboardEntry());
  assert.ok(aliases, "the whiteboard entry has search words");
  const words = [...aliases[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((match) => match[1]);
  assert.ok(words.includes("draw"), `draw is missing from ${JSON.stringify(words)}`);
  assert.ok(words.includes("drawing"), `drawing is missing from ${JSON.stringify(words)}`);
});

test("/whiteboard stays the only board-creating command: no other entry lists draw", () => {
  const listingDraw = [...catalogSource.matchAll(/aliases\s*:\s*\[[^\]]*["'`]draw(?:ing)?["'`]/gi)];
  assert.equal(listingDraw.length, 1);
  assert.equal((catalogSource.match(/kind: "whiteboard"/g) ?? []).length, 1);
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
