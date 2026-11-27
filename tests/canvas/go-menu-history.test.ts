/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   go-menu-history.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// Go › Back/Forward rows: accelerators present, disabled until a page lies that way.

import assert from "node:assert/strict";
import test from "node:test";

const { goMenu } = await import("@/widgets/top-bar/model/menus/goMenu");
const { useNavHistory } = await import("@/widgets/workspace-grid/model/useNavHistory");
const { isSubmenu } = await import("@/widgets/top-bar/model/menuTypes");

const opened: (string | undefined)[] = [];
const rows = () => goMenu({ openSettings: (section) => void opened.push(section) }).items.filter((item) => !isSubmenu(item));

test("AI settings opens the AI section of Settings", () => {
  rows().find((r) => r.label === "AI settings")?.run();
  assert.deepEqual(opened, ["ai"]);
});

test("Back and Forward carry accelerators and start disabled", () => {
  const back = rows().find((r) => r.id === "go.back");
  const forward = rows().find((r) => r.id === "go.forward");
  assert.equal(back?.accelerator, "Alt+←");
  assert.equal(forward?.accelerator, "Alt+→");
  assert.equal(back?.disabled?.(), true);
  assert.equal(forward?.disabled?.(), true);
  assert.equal(useNavHistory.getState().history.entries.length, 0);
});

test("Go to page shows Ctrl+P", () => {
  assert.equal(rows().find((r) => r.id === "go.page")?.accelerator, "Ctrl+P");
});
