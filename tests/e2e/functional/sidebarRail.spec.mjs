/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sidebarRail.spec.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The left sidebar: the activity rail is always there when docked, with the
// panel beside it; one click switches panel; the active icon folds the panel.
// Ctrl+Alt+B hides it fully, and then nothing floats over the content: resting
// the pointer on the left edge slides it in, the pin docks it again.

import { test, expect } from "@playwright/test";

const rail = (page) => page.getByRole("tablist", { name: "Activity bar" });
const explorer = (page) => page.getByText("Explorer", { exact: true });
const peek = (page) => page.locator("[data-sidebar-peek]");

async function gotoDocked(page, baseURL) {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await explorer(page).waitFor();
}

async function dragHandleTo(page, toX) {
  const handle = page.getByRole("separator", { name: "Resize sidebar" });
  const box = await handle.boundingBox();
  if (!box) throw new Error("resize handle not found");
  const y = box.y + Math.min(80, box.height / 2);
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(toX, y, { steps: 12 });
  await page.mouse.up();
}

async function hideSidebar(page) {
  await page.locator("main").click({ position: { x: 400, y: 300 } });
  await page.keyboard.press("Control+Alt+b");
  await expect(page.locator('aside[data-sidebar-mode]:not([data-sidebar-mode="peek"])')).toHaveCount(0);
}

test.describe("activity rail sidebar", () => {
  test("the rail sits beside the panel, and one click switches panel", async ({ page, baseURL }) => {
    await gotoDocked(page, baseURL);
    await expect(rail(page)).toBeVisible();
    await page.getByRole("tab", { name: /^Search/ }).click();
    await expect(page.getByLabel("Search query")).toBeVisible();
    await expect(rail(page)).toBeVisible();
    await page.getByRole("tab", { name: /^Explorer/ }).click();
    await expect(explorer(page)).toBeVisible();
  });

  // A loaded panel must not wait behind a Suspense fallback: React holds a
  // revealed boundary back ~300ms, which was every panel's first open.
  // Counted in frames, not milliseconds, so a slow CI machine cannot flake it.
  for (const [name, panel, content, file] of [
    ["Conversations", "conversations", 'input[aria-label="Filter conversations"]', "/src/widgets/activity-rail/ui/panels/ConversationsPanel.tsx"],
    ["Search", "search", '[aria-label="Search query"]', "/src/features/search/ui/SearchPanel.tsx"],
  ]) {
    test(`${name}, once its code has loaded, shows its content in the first frame after the click`, async ({ page, baseURL }) => {
      await gotoDocked(page, baseURL);
      // Hovering starts the rail's prefetch; importing the same module here
      // returns once that code is loaded.
      await page.getByRole("tab", { name: new RegExp(`^${name}`) }).hover();
      await page.evaluate(async (path) => { await import(path); }, file);
      const emptyFrames = await page.evaluate(async ({ name, panel, content }) => {
        const tab = [...document.querySelectorAll('[role="tab"]')].find((t) => t.getAttribute("aria-label")?.startsWith(name));
        tab.click();
        for (let frame = 0; frame < 120; frame++) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          if (document.querySelector(`[data-sidebar-panel="${panel}"] ${content}`)) return frame;
        }
        return 120;
      }, { name, panel, content });
      expect(emptyFrames).toBe(0);
    });
  }

  test("clicking the active icon folds the panel to the rail; the fold survives a reload", async ({ page, baseURL }) => {
    await gotoDocked(page, baseURL);
    await page.getByRole("tab", { name: /^Explorer/, selected: true }).click();
    await expect(explorer(page)).toBeHidden();
    await expect(rail(page)).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await rail(page).waitFor();
    await expect(explorer(page)).toBeHidden();
  });

  test("dragging the edge narrow folds to the rail; dragging the rail edge left hides it", async ({ page, baseURL }) => {
    await gotoDocked(page, baseURL);
    await dragHandleTo(page, 70);
    await expect(explorer(page)).toBeHidden();
    await expect(rail(page)).toBeVisible();
    await dragHandleTo(page, 3);
    // Only the (closed) edge peek is left, no docked sidebar.
    await expect(page.locator('aside[data-sidebar-mode]:not([data-sidebar-mode="peek"])')).toHaveCount(0);
    // The drag ended on the edge strip. A hand still resting there must not
    // bring back the sidebar it just hid.
    await page.mouse.move(2, 300);
    await page.waitForTimeout(500);
    await expect(peek(page)).not.toHaveAttribute("data-open", "");
  });

  test("Ctrl+Alt+B hides and restores; nothing floats over the content, and the top bar has no toggle or brand label", async ({ page, baseURL }) => {
    await gotoDocked(page, baseURL);
    await expect(page.getByTestId("app-topbar").getByRole("button", { name: "Toggle sidebar" })).toHaveCount(0);
    await expect(page.getByTestId("app-topbar")).not.toContainText("osionos");
    await hideSidebar(page);
    await expect(page.getByRole("button", { name: "Open sidebar" })).toHaveCount(0);
    await page.keyboard.press("Control+Alt+b");
    await expect(explorer(page)).toBeVisible();
  });

  test("resting on the left edge peeks the sidebar in; passing by does not; the pin docks it", async ({ page, baseURL }) => {
    await gotoDocked(page, baseURL);
    await hideSidebar(page);
    const y = 400;

    // Passing through the edge quickly, or hovering 40px in, reveals nothing.
    await page.mouse.move(3, y);
    await page.mouse.move(300, y);
    await page.waitForTimeout(400);
    await expect(peek(page)).not.toHaveAttribute("data-open", "");
    await page.mouse.move(40, y);
    await page.waitForTimeout(400);
    await expect(peek(page)).not.toHaveAttribute("data-open", "");

    // Resting on it does.
    await page.mouse.move(3, y);
    await expect(peek(page)).toHaveAttribute("data-open", "");
    await expect(peek(page).getByText("Explorer", { exact: true })).toBeVisible();

    // Leaving it slides it away.
    await page.mouse.move(900, y);
    await expect(peek(page)).not.toHaveAttribute("data-open", "");

    // The pin docks it again.
    await page.mouse.move(3, y);
    await expect(peek(page)).toHaveAttribute("data-open", "");
    await peek(page).getByRole("button", { name: "Keep the sidebar open" }).click();
    await expect(peek(page)).toHaveCount(0);
    await expect(explorer(page)).toBeVisible();
  });

  // The rail icon's own accent ring (ring-offset on the OLD rail background) never painted: the global
  // keyboard-focus rule is unlayered and wins the box-shadow. What shows is its outline and inset fill, so the
  // test holds that nothing else, like a ring-offset halo in a stale colour, is drawn in either context.
  test("a rail icon shows the global focus indicator and no ring offset, docked or in the peek card", async ({ page, baseURL }) => {
    await gotoDocked(page, baseURL);
    const indicatorOf = async (tab) => {
      await page.keyboard.press("Tab");
      await tab.focus();
      return tab.evaluate((el) => {
        const css = getComputedStyle(el);
        return { outline: css.outlineStyle, shadow: css.boxShadow.split(/\)\s*,/).length };
      });
    };
    expect(await indicatorOf(rail(page).getByRole("tab", { name: /^Search/ }))).toEqual({ outline: "solid", shadow: 1 });

    await hideSidebar(page);
    await page.mouse.move(300, 400);
    await page.mouse.move(3, 400);
    await expect(peek(page)).toHaveAttribute("data-open", "");
    expect(await indicatorOf(peek(page).getByRole("tab", { name: /^Search/ }))).toEqual({ outline: "solid", shadow: 1 });
  });

  // Marketplace shows its labels only once it has apps, so a fresh stack does not reach it; it uses the same
  // PanelSectionLabel as Conversations. Shared and Agents carry no label: the panel title already names them.
  test("every section label in a panel is sentence case, with no letter-spacing", async ({ page, baseURL }) => {
    await gotoDocked(page, baseURL);
    // An h2 label would be serif without the family override: the global h1-h4 rule sets the heading stack.
    const bodyFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    for (const [tab, panel] of [["Conversations", "conversations"]]) {
      await rail(page).getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
      const labels = page.locator(`[data-sidebar-panel="${panel}"]:not([hidden]) [data-section-label]`);
      await expect(labels.first()).toBeVisible();
      for (const style of await labels.evaluateAll((els) => els.map((el) => {
        const css = getComputedStyle(el);
        return { text: el.textContent, transform: css.textTransform, spacing: css.letterSpacing, family: css.fontFamily };
      }))) {
        expect(style, `${panel}: ${style.text}`).toMatchObject({ transform: "none", spacing: "normal", family: bodyFamily });
      }
    }

    // The panel title already says "Shared"; a second label of the same style read as a stutter.
    await rail(page).getByRole("tab", { name: /^Shared/ }).click();
    await expect(page.locator('[data-sidebar-panel="public"]:not([hidden]) [data-section-label]')).toHaveCount(0);
  });
});
