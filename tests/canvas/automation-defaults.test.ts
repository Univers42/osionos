/* ************************************************************************** */
/*  automation-defaults.test.ts — every seeded shortcut resolves + is unique */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

// The `when` predicates call isTextEntryTarget(el), which does `el instanceof
// Element`. Node has no DOM, so give it a constructor — activeElement is null in
// these tests, and `null instanceof Element` is a safe `false`.
const domGlobals = globalThis as unknown as { Element?: unknown };
domGlobals.Element ??= class Element {};

import { DEFAULT_AUTOMATIONS } from "../../src/features/automations/model/defaultAutomations.ts";
import { matchAutomation } from "../../src/features/automations/model/automationMatch.ts";
import { normalizeComboString } from "../../src/features/automations/model/combo.ts";
import type { CommandContext, CommandId } from "../../src/features/automations/model/types.ts";

// The command vocabulary, mirroring the CommandId union in model/types.ts. The
// registry↔defaults consistency (every id maps to a real Command) is enforced at
// compile time (defaults are typed `CommandId`; ALL_COMMANDS is `Command[]`), so
// this test stays hermetic and does not import the effectful command graph.
const KNOWN_COMMAND_IDS = new Set<CommandId>([
  "undo", "redo", "selectAll", "clearSelection", "copy", "cut", "paste",
  "pastePlain", "duplicate", "delete", "moveBlockUp", "moveBlockDown",
  "heading1", "heading2", "heading3", "openPalette", "openSearch", "splitPane",
  "bold", "italic", "underline", "inlineCode", "link",
]);

/** A context where every enabled default's `when` predicate holds (block selection
 *  present, an editor handle registered, not inside a text field). */
function passingContext(): CommandContext {
  return {
    event: {} as KeyboardEvent,
    handle: { sourceKey: "s", pageId: "p", kind: "linear" } as unknown as CommandContext["handle"],
    selection: { ids: ["block-x"], pageId: "p", sourceKey: "s" },
    activeElement: null,
  };
}

test("there are ~25 seeded shortcuts", () => {
  assert.ok(DEFAULT_AUTOMATIONS.length >= 24, `expected ≥24 defaults, got ${DEFAULT_AUTOMATIONS.length}`);
});

test("every default maps to a known command via a run_command action", () => {
  for (const automation of DEFAULT_AUTOMATIONS) {
    const action = automation.actions[0];
    assert.ok(action?.type === "run_command", `${automation.id} has a run_command action`);
    assert.ok(KNOWN_COMMAND_IDS.has(action.commandId), `${automation.id} → "${action.commandId}" is a known command`);
  }
});

test("every ENABLED default resolves via matchAutomation to exactly itself", () => {
  const ctx = passingContext();
  for (const automation of DEFAULT_AUTOMATIONS.filter((a) => a.enabled)) {
    const combo = normalizeComboString(automation.trigger.combo);
    const matched = matchAutomation(DEFAULT_AUTOMATIONS, combo, ctx);
    assert.ok(matched, `${automation.id} (${combo}) resolves under a passing context`);
    assert.equal(matched?.id, automation.id, `${combo} resolves to ${automation.id}, not ${matched?.id}`);
  }
});

test("DISABLED defaults (native-handled format keys) never fire", () => {
  const ctx = passingContext();
  for (const automation of DEFAULT_AUTOMATIONS.filter((a) => !a.enabled)) {
    const combo = normalizeComboString(automation.trigger.combo);
    // No ENABLED default shares that combo, so the dispatcher matches nothing.
    const matched = matchAutomation(DEFAULT_AUTOMATIONS, combo, ctx);
    assert.equal(matched, null, `${combo} (${automation.id}) must not resolve while disabled`);
  }
});

test("no two seeded shortcuts collide on combo + condition, and ids are unique", () => {
  const keys = DEFAULT_AUTOMATIONS
    .filter((a) => a.enabled && a.trigger.combo)
    .map((a) => `${normalizeComboString(a.trigger.combo)}::${a.trigger.when}`);
  assert.equal(new Set(keys).size, keys.length, "combo + condition pairs are unique among enabled defaults");

  const ids = DEFAULT_AUTOMATIONS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
});
