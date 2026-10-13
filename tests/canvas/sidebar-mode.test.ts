/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sidebar-mode.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 06:10:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 06:10:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Ctrl+Alt+B hides a docked sidebar and brings it back as it was docked; a
// saved "messenger" panel opens the Conversations panel that replaced it.

import assert from "node:assert/strict";
import test from "node:test";

import { migratePanelId, migrateUiState, nextSidebarMode } from "../../src/shared/config/uiStore.ts";

test("nextSidebarMode: docked hides, hidden comes back to the last docked mode", () => {
  assert.equal(nextSidebarMode("panel", "panel"), "hidden");
  assert.equal(nextSidebarMode("rail", "rail"), "hidden");
  assert.equal(nextSidebarMode("hidden", "rail"), "rail");
  assert.equal(nextSidebarMode("hidden", "panel"), "panel");
});

test("migratePanelId: messenger became conversations; unknown ids open Files", () => {
  assert.equal(migratePanelId("messenger"), "conversations");
  assert.equal(migratePanelId("search"), "search");
  assert.equal(migratePanelId("gone"), "files");
  assert.equal(migratePanelId(undefined), "files");
});

test("migrateUiState v1 → v2 keeps the mode and width and remembers how it was docked", () => {
  const v1 = { sidebarMode: "rail", activePanel: "messenger", sidebarWidth: 312, isSidebarOpen: true };
  const v2 = migrateUiState(v1, 1);
  assert.equal(v2.sidebarMode, "rail");
  assert.equal(v2.sidebarWidth, 312);
  assert.equal(v2.activePanel, "conversations");
  assert.equal(v2.lastDockedMode, "rail");
  assert.equal(migrateUiState({ sidebarMode: "hidden", activePanel: "files" }, 1).lastDockedMode, "panel");
});

test("migrateUiState v0 maps the old open flag and leaves a docked mode to return to", () => {
  const v1 = migrateUiState({ isSidebarOpen: false, sidebarWidth: 9999 }, 0);
  assert.equal(v1.sidebarMode, "hidden");
  assert.equal(v1.lastDockedMode, "panel");
  assert.ok(v1.sidebarWidth <= 480);
});
