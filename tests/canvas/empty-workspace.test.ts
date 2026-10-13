/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   empty-workspace.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 05:25:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 05:25:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Closing the last tab leaves an empty workspace, not Home reopened; the start
// screen shows the keys each action is bound to, from the user's own bindings.

import assert from "node:assert/strict";
import test from "node:test";

import { emptyLayout } from "../../src/widgets/workspace-grid/model/layoutPersist.ts";
import { shortcutLabel } from "../../src/features/automations/model/shortcutLabel.ts";
import { DEFAULT_AUTOMATIONS } from "../../src/features/automations/model/defaultAutomations.ts";

test("emptyLayout is one pane with no tab at all", () => {
  const { root, activePaneId } = emptyLayout();
  assert.equal(root.type, "pane");
  assert.equal(root.id, activePaneId);
  assert.deepEqual(root.tabs, []);
  assert.equal(root.activeTabId, null);
});

test("shortcutLabel reads the bound keys, and follows the user's rebinding", () => {
  assert.equal(shortcutLabel(DEFAULT_AUTOMATIONS, "newPage"), "Ctrl + Alt + N");
  assert.equal(shortcutLabel(DEFAULT_AUTOMATIONS, "openSearch"), "Ctrl + K");
  const rebound = DEFAULT_AUTOMATIONS.map((automation) => automation.id === "open-search"
    ? { ...automation, trigger: { ...automation.trigger, combo: "mod+p" } }
    : automation);
  assert.equal(shortcutLabel(rebound, "openSearch"), "Ctrl + P");
  const disabled = DEFAULT_AUTOMATIONS.map((automation) => automation.id === "new-page" ? { ...automation, enabled: false } : automation);
  assert.equal(shortcutLabel(disabled, "newPage"), null);
});
