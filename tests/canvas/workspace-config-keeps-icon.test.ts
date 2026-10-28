/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspace-config-keeps-icon.test.ts                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

const { useWorkspaceConfigStore } = await import("../../src/shared/config/workspaceConfigStore.ts");

test("updateSettings(u, w, { name: 'x' }) leaves configs[key].icon undefined", async () => {
  const u = "icon-test-user-a";
  const w = "icon-test-workspace-a";
  await useWorkspaceConfigStore.getState().updateSettings(u, w, { name: "x" });
  const key = `${u}:${w}`;
  assert.equal(useWorkspaceConfigStore.getState().configs[key]?.icon, undefined);
});

test("updateSettings(u, w, { icon: '🔥' }) stores '🔥'", async () => {
  const u = "icon-test-user-b";
  const w = "icon-test-workspace-b";
  await useWorkspaceConfigStore.getState().updateSettings(u, w, { icon: "🔥" });
  const key = `${u}:${w}`;
  assert.equal(useWorkspaceConfigStore.getState().configs[key]?.icon, "🔥");
});