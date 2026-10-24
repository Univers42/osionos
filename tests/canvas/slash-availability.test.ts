import assert from "node:assert/strict";
import test from "node:test";

import { isSlashCommandAvailable } from "../../src/features/slash-commands/model/slashAvailability.ts";
import { isBuiltInAppReady, WHITEBOARD_APP_ID } from "../../src/features/whiteboard/model/whiteboardAvailability.ts";

test("a command without requiresApp is always available", () => {
  assert.equal(isSlashCommandAvailable({}, { isAppReady: () => false }), true);
});

test("a command that requires an app follows that app's readiness", () => {
  const command = { requiresApp: "osionos.whiteboard" };
  assert.equal(isSlashCommandAvailable(command, { isAppReady: (id) => id === "osionos.whiteboard" }), true);
  assert.equal(isSlashCommandAvailable(command, { isAppReady: () => false }), false);
});

test("readiness of a different app does not unlock the command", () => {
  assert.equal(isSlashCommandAvailable({ requiresApp: "osionos.whiteboard" }, { isAppReady: (id) => id === "osionos.mail" }), false);
});

// The menu wires `isBuiltInAppReady` as its availability context, so these run the real chain.
const REAL_AVAILABILITY = { isAppReady: isBuiltInAppReady };

test("the whiteboard command is available with an empty installed map (built in)", () => {
  assert.equal(isSlashCommandAvailable({ requiresApp: WHITEBOARD_APP_ID }, REAL_AVAILABILITY), true);
});

test("the whiteboard command disappears when the osio.whiteboard flag is off", () => {
  (globalThis as { window?: unknown }).window = { location: { search: "?osio.whiteboard=0", hash: "" }, localStorage: { getItem: () => null } };
  try {
    assert.equal(isSlashCommandAvailable({ requiresApp: WHITEBOARD_APP_ID }, REAL_AVAILABILITY), false);
    assert.equal(isSlashCommandAvailable({}, REAL_AVAILABILITY), true);
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

test("a command that requires another app is never made available by the whiteboard", () => {
  assert.equal(isSlashCommandAvailable({ requiresApp: "osionos.mail" }, REAL_AVAILABILITY), false);
});
