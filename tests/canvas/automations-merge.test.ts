/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   automations-merge.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// A saved blob holds only the user's overrides and custom rows, so a default
// added later reaches existing users and their own edits survive it.

import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_AUTOMATIONS } from "../../src/features/automations/model/defaultAutomations.ts";
import { mergeAutomations } from "../../src/features/automations/model/mergeAutomations.ts";
import type { Automation } from "../../src/features/automations/model/types.ts";

const custom: Automation = {
  id: "mine", name: "Mine", enabled: true,
  trigger: { type: "keyboard", combo: "mod+alt+9", when: "always" },
  actions: [{ type: "run_command", commandId: "openSearch" }],
};

test("a user saved before the VS Code keys still receives them", () => {
  const saved = { overrides: {}, custom: [] };
  const merged = mergeAutomations(DEFAULT_AUTOMATIONS, saved.overrides, saved.custom);
  for (const id of ["go-back", "go-forward", "quick-open", "explorer-panel", "scm-panel", "toggle-sidebar-ctrl-b"]) {
    assert.ok(merged.some((a) => a.id === id && a.enabled), `${id} is delivered`);
  }
});

test("the user's own override of a default wins and their custom rows are appended", () => {
  const rebound: Automation = {
    ...DEFAULT_AUTOMATIONS.find((a) => a.id === "toggle-sidebar")!,
    trigger: { type: "keyboard", combo: "mod+alt+j", when: "always" },
  };
  const merged = mergeAutomations(DEFAULT_AUTOMATIONS, { "toggle-sidebar": rebound }, [custom]);
  assert.equal(merged.find((a) => a.id === "toggle-sidebar")?.trigger.combo, "mod+alt+j");
  assert.equal(merged.at(-1)?.id, "mine");
  assert.equal(merged.length, DEFAULT_AUTOMATIONS.length + 1);
});

test("a stale override for an id that no longer exists is ignored, not resurrected", () => {
  const merged = mergeAutomations(DEFAULT_AUTOMATIONS, { gone: custom }, []);
  assert.equal(merged.some((a) => a.id === "mine"), false);
});
