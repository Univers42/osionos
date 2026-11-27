/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   shell-keybindings.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// The VS Code shell keys, resolved through the one automation table: each key
// against the focus it is pressed in, and the guard that keeps a key a dialog,
// an IME or an earlier handler already owns.

import assert from "node:assert/strict";
import test from "node:test";

// isTextEntryTarget does `target instanceof Element`; Node has no DOM, so a
// stand-in whose closest() answers like an input does.
const domGlobals = globalThis as unknown as { Element?: new () => object };
domGlobals.Element ??= class Element {};
const ElementBase = domGlobals.Element as new () => { closest?: (selector: string) => unknown };
class FakeField extends ElementBase {
  closest(): unknown { return this; }
}

import { DEFAULT_AUTOMATIONS } from "../../src/features/automations/model/defaultAutomations.ts";
import { matchAutomation } from "../../src/features/automations/model/automationMatch.ts";
import { keyIsOwnedElsewhere } from "../../src/features/automations/model/dispatchGuards.ts";
import type { Automation, CommandContext } from "../../src/features/automations/model/types.ts";

function ctxIn(field: boolean): CommandContext {
  return {
    event: {} as KeyboardEvent,
    handle: null,
    selection: { ids: [], pageId: null, sourceKey: null },
    activeElement: field ? (new FakeField() as unknown as Element) : null,
  };
}

function commandFor(combo: string, field = false, table: readonly Automation[] = DEFAULT_AUTOMATIONS): string | null {
  return matchAutomation(table, combo, ctxIn(field))?.actions[0]?.commandId ?? null;
}

test("Ctrl+B toggles the side bar outside text and is left to the editor inside it", () => {
  assert.equal(commandFor("mod+b"), "toggleSidebar");
  assert.equal(commandFor("mod+b", true), null);
});

test("an enabled Bold row keeps Ctrl+B inside text while the page body still toggles", () => {
  const withBold = DEFAULT_AUTOMATIONS.map((a) => (a.id === "bold" ? { ...a, enabled: true } : a));
  assert.equal(commandFor("mod+b", true, withBold), "bold");
  assert.equal(commandFor("mod+b", false, withBold), "toggleSidebar");
});

test("Ctrl+Alt+B still toggles the side bar", () => {
  assert.equal(commandFor("mod+alt+b"), "toggleSidebar");
});

test("the VS Code view keys", () => {
  const table: Record<string, string> = {
    "mod+p": "openSearch",
    "mod+shift+e": "toggleExplorerPanel",
    "mod+shift+f": "openSearchPanel",
    "mod+shift+g": "toggleScmPanel",
    "mod+\\": "splitPane",
  };
  for (const [combo, command] of Object.entries(table)) {
    assert.equal(commandFor(combo), command, combo);
    assert.equal(commandFor(combo, true), command, `${combo} inside text`);
  }
});

test("Go back is Alt+Left and Ctrl+Alt+-, Go forward is Alt+Right", () => {
  assert.equal(commandFor("alt+arrowleft"), "goBack");
  assert.equal(commandFor("mod+alt+-"), "goBack");
  assert.equal(commandFor("alt+arrowright"), "goForward");
});

test("Ctrl+Shift+- stays pane zoom-out and never means Go forward", () => {
  assert.equal(commandFor("mod+shift+_"), "zoomPaneOut");
  assert.equal(DEFAULT_AUTOMATIONS.some((a) => a.trigger.combo.includes("shift") && a.actions[0]?.commandId === "goForward"), false);
});

test("Ctrl+1, Ctrl+2 and Ctrl+3 focus editor group 1, 2 and 3", () => {
  assert.equal(commandFor("mod+1"), "focusEditorGroup1");
  assert.equal(commandFor("mod+2"), "focusEditorGroup2");
  assert.equal(commandFor("mod+3"), "focusEditorGroup3");
});

test("a key already handled, mid-composition or under an open dialog is not ours", () => {
  const plain = { defaultPrevented: false, isComposing: false, keyCode: 66 };
  assert.equal(keyIsOwnedElsewhere(plain, false), false);
  assert.equal(keyIsOwnedElsewhere({ ...plain, defaultPrevented: true }, false), true);
  assert.equal(keyIsOwnedElsewhere({ ...plain, isComposing: true }, false), true);
  assert.equal(keyIsOwnedElsewhere({ ...plain, keyCode: 229 }, false), true);
  assert.equal(keyIsOwnedElsewhere(plain, true), true);
});
