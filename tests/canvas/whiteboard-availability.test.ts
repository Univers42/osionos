import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import {
  isBuiltInAppReady,
  isWhiteboardReady,
  WHITEBOARD_APP_ID,
} from "../../src/features/whiteboard/model/whiteboardAvailability.ts";

// Feature flags read `globalThis.window` on every call, so a stub is enough to flip one.
function withQueryString(search: string): void {
  (globalThis as { window?: unknown }).window = { location: { search, hash: "" }, localStorage: { getItem: () => null } };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

test("the Whiteboard is ready with nothing installed: readiness takes no install state", () => {
  assert.equal(isWhiteboardReady.length, 0);
  assert.equal(isWhiteboardReady(), true);
});

test("the osio.whiteboard kill-switch hides it", () => {
  withQueryString("?osio.whiteboard=0");
  assert.equal(isWhiteboardReady(), false);
  assert.equal(isBuiltInAppReady(WHITEBOARD_APP_ID), false);
});

test("an explicit osio.whiteboard=1 keeps it ready", () => {
  withQueryString("?osio.whiteboard=1");
  assert.equal(isWhiteboardReady(), true);
});

test("only the whiteboard identifier is a ready built-in app", () => {
  assert.equal(isBuiltInAppReady(WHITEBOARD_APP_ID), true);
  assert.equal(isBuiltInAppReady("osionos.draw"), false);
  assert.equal(isBuiltInAppReady("osionos.mail"), false);
  assert.equal(isBuiltInAppReady(""), false);
});
