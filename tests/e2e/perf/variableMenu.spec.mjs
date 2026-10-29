/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   variableMenu.spec.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// `{{NAME}}` variables in the editor, keydown -> painted frame: the second `{` opening the
// menu, a keystroke that re-ranks it, and plain typing in a block that already holds chips.
// Floor and method: perfHarness.mjs. Target 16 ms sits below the floor, so the budget is one
// frame over it, the same 38 ms as typing.spec.mjs and the slash menu.
// Measured 2026-10-28, p95 over n=20 (median over the floor's median):
//   dev build       : open 31.2 ms (+2.7), filter 32.0 ms (+0.8), typing beside chips 31.7 ms (+0.8)
//   production build: open 31.8 ms (+0.5), filter 31.3 ms (-0.3), typing beside chips 31.6 ms (+0.2)
//
// Caveat: dev build under StrictMode, Docker software rendering; p95 is an upper bound. Only
// built-in names are offered here (the offline build has no env.json), so the menu ranks 4
// names; 500 names are in tests/bench/variables.bench.ts, without React.

import { expect, test } from "@playwright/test";

import { activateFirstEditor, createNewWorkspacePage, waitForRenderStability } from "../../browser/core/app.mjs";
import { runInteraction } from "./interactionRun.mjs";
import { PERF_USE, bootApp, measureFloor } from "./perfHarness.mjs";

test.use(PERF_USE);

const SPEC = "variableMenu";
const TARGET = 16;
const BUDGET = { open: 38, filter: 38, typeBesideChips: 38 };
const MENU = '[data-testid="variable-menu"]';

async function openBlock(page, text) {
  await bootApp(page);
  const floor = await measureFloor(page);
  await createNewWorkspacePage(page);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type(text, { delay: 20 });
  await expect(editor).toHaveAttribute("data-empty", "false");
  return { floor, editor };
}

test("second { opens the menu", async ({ page }) => {
  test.setTimeout(240_000);
  const { floor, editor } = await openBlock(page, "x {");
  const menu = page.locator(MENU);
  await runInteraction(page, {
    spec: SPEC, name: "open", floor, target: TARGET, budget: BUDGET.open, startEvent: "keydown",
    before: async () => {
      if (await menu.count()) await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await editor.press("End");
      if ((await editor.textContent()).endsWith("{{")) await page.keyboard.press("Backspace");
      await expect(editor).toHaveText("x {");
      await waitForRenderStability(page);
    },
    action: () => page.keyboard.press("{"),
    until: { selector: `${MENU} [role="option"]` },
  });
});

test("a keystroke re-ranks the open menu", async ({ page }) => {
  test.setTimeout(240_000);
  const { floor, editor } = await openBlock(page, "x {{T");
  const active = `${MENU} [role="option"][aria-selected="true"]`;
  await runInteraction(page, {
    spec: SPEC, name: "filter", floor, target: TARGET, budget: BUDGET.filter, startEvent: "keydown",
    before: async () => {
      if ((await editor.textContent()).endsWith("TI")) await page.keyboard.press("Backspace");
      await expect(page.locator(active)).toContainText("TODAY");
      await waitForRenderStability(page);
    },
    action: () => page.keyboard.press("I"),
    until: { selector: active, text: "TIME" },
  });
});

test("typing in a block that holds 10 chips", async ({ page }) => {
  test.setTimeout(240_000);
  const { floor, editor } = await openBlock(page, "{{TODAY}} ".repeat(10));
  await expect(page.locator("span.md-variable")).toHaveCount(10);
  await runInteraction(page, {
    spec: SPEC, name: "typeBesideChips", floor, target: TARGET, budget: BUDGET.typeBesideChips, startEvent: "keydown",
    action: () => page.keyboard.press("a"),
  });
  await expect(editor).toContainText("a".repeat(30));
});
