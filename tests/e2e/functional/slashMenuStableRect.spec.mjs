// Issue #330: while "/database" is typed the list filters and shrinks. The panel
// must keep its rectangle for the life of one open menu, or a click aimed at an
// entry's old position lands outside it and the outside-mousedown handler closes
// the menu with no pick.

import { test, expect } from "@playwright/test";

import { activateFirstEditor, openFreshPage, slashMenu } from "../../browser/core/app.mjs";

// The panel scales in on open (osio-slash-menu-in), so a rect taken mid-animation is
// not its layout rect: wait for its animations to finish first.
const settledRect = async (locator) => {
  await locator.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box;
};

test.describe("slash menu keeps its rectangle while it filters", () => {
  test("the panel rect is unchanged between the full and a filtered list", async ({ page }) => {
    await openFreshPage(page, "/");
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("/");
    const menu = slashMenu(page);
    await expect(menu).toBeVisible();
    const entries = menu.getByTestId("slash-command-entry");
    const fullCount = await entries.count();
    const before = await settledRect(menu);

    await page.keyboard.type("database");
    await expect.poll(() => entries.count()).toBeLessThan(fullCount);
    const after = await settledRect(menu);
    for (const key of ["x", "y", "width", "height"]) expect(after[key]).toBeCloseTo(before[key], 0);

    // A click where a row used to be is still inside the panel: the menu stays open.
    await page.mouse.click(before.x + before.width / 2, before.y + before.height / 2);
    await expect(menu).toBeVisible();
  });
});
