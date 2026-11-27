// ************************************************************************** //
//                                                                            //
//   messengerPolish.perf.spec.mjs                                            //
//                                                                            //
//   Row hover -> toolbar painted, composer focus -> painted, one key in      //
//   the AI composer -> painted. Target p95 <= floor + 16 ms.                 //
//                                                                            //
// ************************************************************************** //

import { test } from "@playwright/test";

import { PERF_USE, assertBudget, bootApp, measureFloor, measureToPaint } from "./perfHarness.mjs";

test.use(PERF_USE);

const SUPPORT = "/tests/e2e/support/mountMessenger.tsx";

async function mountHarness(page, fn, arg) {
  const module = await page.evaluateHandle((path) => import(path), SUPPORT);
  await page.evaluate(({ module: m, fn: name, arg: value }) => m[name](value), { module, fn, arg });
}

// Ponytail: the probe times to the 2nd frame after the event, so the toolbar's 150 ms opacity fade is not waited on.
test("messenger row hover, toolbar", async ({ page }) => {
  test.setTimeout(120_000);
  await bootApp(page);
  await mountHarness(page, "mountChannel");
  const floor = await measureFloor(page);
  const row = page.locator("article", { hasText: "First message from Ada" });
  const stats = await measureToPaint(page, () => row.hover(), {
    startEvent: "mousemove",
    before: () => page.mouse.move(2, 2),
  });
  assertBudget("messengerPolish", "row.hover", stats, { target: 16, budget: 40 }, { floor });
});

test("messenger composer focus", async ({ page }) => {
  test.setTimeout(120_000);
  await bootApp(page);
  await mountHarness(page, "mountChannel");
  const floor = await measureFloor(page);
  const box = page.getByTestId("pm-composer-full").getByRole("textbox");
  const stats = await measureToPaint(page, () => box.focus(), {
    startEvent: "focusin",
    before: () => box.evaluate((el) => el.blur()),
  });
  assertBudget("messengerPolish", "composer.focus", stats, { target: 16, budget: 40 }, { floor });
});

test("AI composer keystroke", async ({ page }) => {
  test.setTimeout(120_000);
  await bootApp(page);
  await page.getByRole("tab", { name: /^Conversations/ }).click();
  await page.locator('[data-sidebar-panel="conversations"]').getByRole("button", { name: "New AI chat" }).click();
  const input = page.getByPlaceholder("Ask osionos AI…");
  await input.focus();
  const floor = await measureFloor(page);
  await input.focus();
  const stats = await measureToPaint(page, () => page.keyboard.press("a"), {
    before: () => input.fill(""),
  });
  assertBudget("messengerPolish", "aiComposer.key", stats, { target: 16, budget: 40 }, { floor });
});
