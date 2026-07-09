/* ************************************************************************** */
/*  automation-combo.test.ts — keyboard-combo canonicalization               */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCombo,
  isModifierKey,
  normalizeComboFromEvent,
  normalizeComboString,
} from "../../src/features/automations/model/combo.ts";

function key(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, key: "", ...overrides } as KeyboardEvent;
}

test("normalizeComboFromEvent: canonical mod/alt/shift order, mod abstracts ctrl+meta", () => {
  assert.equal(normalizeComboFromEvent(key({ ctrlKey: true, key: "z" })), "mod+z");
  assert.equal(normalizeComboFromEvent(key({ metaKey: true, key: "z" })), "mod+z");
  assert.equal(normalizeComboFromEvent(key({ ctrlKey: true, shiftKey: true, key: "Z" })), "mod+shift+z");
  assert.equal(normalizeComboFromEvent(key({ ctrlKey: true, altKey: true, key: "1" })), "mod+alt+1");
  assert.equal(normalizeComboFromEvent(key({ key: "Escape" })), "escape");
  assert.equal(normalizeComboFromEvent(key({ ctrlKey: true, shiftKey: true, key: "ArrowUp" })), "mod+shift+arrowup");
});

test("normalizeComboString: aliases + reordering collapse to one canonical form", () => {
  assert.equal(normalizeComboString("Ctrl+Z"), "mod+z");
  assert.equal(normalizeComboString("Cmd+Shift+Z"), "mod+shift+z");
  assert.equal(normalizeComboString("Meta+Z"), "mod+z");
  // Modifier order in the source string does not matter — output is always mod,alt,shift,key.
  assert.equal(normalizeComboString("shift+alt+mod+k"), "mod+alt+shift+k");
  assert.equal(normalizeComboString("option+command+p"), "mod+alt+p");
});

test("normalization is idempotent and agrees between event and string forms", () => {
  for (const combo of ["mod+z", "mod+shift+z", "mod+alt+1", "escape", "mod+\\"]) {
    assert.equal(normalizeComboString(normalizeComboString(combo)), normalizeComboString(combo));
  }
  // The two entry points must produce the same key for the same chord.
  assert.equal(
    normalizeComboFromEvent(key({ ctrlKey: true, shiftKey: true, key: "z" })),
    normalizeComboString("ctrl+shift+z"),
  );
});

test("isModifierKey / formatCombo", () => {
  assert.ok(["Control", "Shift", "Alt", "Meta"].every(isModifierKey));
  assert.ok(!isModifierKey("z"));
  assert.equal(formatCombo("mod+shift+z"), "Ctrl + Shift + Z");
});
