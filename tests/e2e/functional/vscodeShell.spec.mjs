/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   vscodeShell.spec.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// VS Code shell keybindings: Ctrl+B side bar, Ctrl+P quick open, Ctrl+Shift+E/F
// panels, Alt+Left/Right history, Ctrl+\ split, Ctrl+1/2/3 groups.
// Ponytail: Playwright key events go through CDP and skip browser accelerators,
// so this cannot prove the browser leaves Ctrl+1..3 or Ctrl+P to the page.

import { expect, test } from "@playwright/test";
import { createNewWorkspacePage, createParagraphs, getEditors, openFreshPage, selectText } from "../../browser/core/app.mjs";
import { chooseViewAppearance } from "../support/viewMenu.mjs";

const sidebar = (page) => page.locator('aside[aria-label="Sidebar"]');
const panes = (page) => page.locator("[data-osio-pane]");
const activeTabId = (page) => page.locator("[data-tab-id][data-active]").first().getAttribute("data-tab-id");

async function openDesktop(page, baseURL) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFreshPage(page, baseURL);
}

async function sidebarMode(page) {
  return sidebar(page).getAttribute("data-sidebar-mode");
}

async function goBackAndForwardRows(page) {
  await page.getByTestId("app-topbar").getByRole("button", { name: "Go", exact: true }).click();
  const back = page.getByRole("menuitem", { name: /^Back/ });
  const forward = page.getByRole("menuitem", { name: /^Forward/ });
  const state = { back: await back.getAttribute("aria-disabled"), forward: await forward.getAttribute("aria-disabled") };
  await page.keyboard.press("Escape");
  return state;
}

test.describe("vscode shell keybindings", () => {
  test("Ctrl+B toggles the side bar from the body but bolds text in a block", async ({ page, baseURL }) => {
    await openDesktop(page, baseURL);
    await page.locator("body").press("Escape");
    const before = await sidebarMode(page);
    await page.keyboard.press("Control+b");
    await expect.poll(() => sidebarMode(page)).not.toBe(before);
    await page.keyboard.press("Control+b");
    await expect.poll(() => sidebarMode(page)).toBe(before);
    await createParagraphs(page, ["bold me"]);
    const editor = getEditors(page).first();
    await selectText(editor, "bold me");
    await page.keyboard.press("Control+b");
    await expect(editor.locator("strong")).not.toHaveCount(0);
    await expect.poll(() => sidebarMode(page)).toBe(before);
  });

  test("Ctrl+P opens quick open and no print dialog", async ({ page, baseURL }) => {
    await openDesktop(page, baseURL);
    let printed = false;
    await page.exposeFunction("__printed", () => { printed = true; });
    await page.evaluate(() => window.addEventListener("beforeprint", () => window.__printed()));
    await page.locator("body").press("Escape");
    await page.keyboard.press("Control+p");
    await expect(page.getByRole("dialog").or(page.getByRole("combobox")).first()).toBeVisible();
    expect(printed).toBe(false);
  });

  test("Ctrl+Shift+E and F switch panels, and the same key again hides the side bar", async ({ page, baseURL }) => {
    await openDesktop(page, baseURL);
    await page.locator("body").press("Escape");
    await page.mouse.move(720, 450);
    const tab = (name) => page.getByRole("tab", { name, exact: true });
    await page.keyboard.press("Control+Shift+F");
    await expect(tab("Search")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Control+Shift+E");
    await expect(tab("Explorer")).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => sidebarMode(page)).toBe("panel");
    await page.keyboard.press("Control+Shift+E");
    await expect.poll(() => sidebarMode(page)).not.toBe("panel");
    await page.keyboard.press("Control+Shift+F");
    await expect(tab("Search")).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => sidebarMode(page)).toBe("panel");
  });

  test("Alt+Left returns to page A, Alt+Right to page B, and the Go rows follow", async ({ page, baseURL }) => {
    await openDesktop(page, baseURL);
    const a = await activeTabId(page);
    await createNewWorkspacePage(page);
    const b = await activeTabId(page);
    expect(b).not.toBe(a);
    expect(await goBackAndForwardRows(page)).toEqual({ back: null, forward: "true" });
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Alt+ArrowLeft");
    await expect.poll(() => activeTabId(page)).toBe(a);
    expect(await goBackAndForwardRows(page)).toMatchObject({ forward: null });
    await page.keyboard.press("Alt+ArrowRight");
    await expect.poll(() => activeTabId(page)).toBe(b);
  });

  test("Ctrl+\\ splits to two panes and Ctrl+1 / Ctrl+2 focus them", async ({ page, baseURL }) => {
    await openDesktop(page, baseURL);
    await expect(panes(page)).toHaveCount(1);
    await page.locator("body").press("Escape");
    await page.keyboard.press("Control+\\");
    await expect(panes(page)).toHaveCount(2);
    await page.keyboard.press("Control+1");
    await expect(panes(page).nth(0)).toHaveAttribute("data-osio-pane-active", "");
    await page.keyboard.press("Control+2");
    await expect(panes(page).nth(1)).toHaveAttribute("data-osio-pane-active", "");
  });

  test("View > Editor layout > Single returns to one pane and loses no tab", async ({ page, baseURL }) => {
    await openDesktop(page, baseURL);
    await page.locator("body").press("Escape");
    await chooseEditorLayout(page, "Split left");
    await expect(panes(page)).toHaveCount(2);
    await chooseEditorLayout(page, "Split down");
    await expect(panes(page)).toHaveCount(3);
    const tabs = await page.locator("[data-tab-id]").count();
    await chooseEditorLayout(page, "Single");
    await expect(panes(page)).toHaveCount(1);
    await expect(page.locator("[data-tab-id]")).toHaveCount(tabs);
  });
});

async function chooseEditorLayout(page, rowName) {
  await page.getByTestId("app-topbar").getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("menuitem", { name: "Editor layout" }).click();
  await page.getByRole("menuitem", { name: rowName, exact: true }).click();
}

const railBox = (page) => page.getByRole("tablist", { name: "Activity bar" }).first().boundingBox();
const mainBox = (page) => page.locator("#osio-main").boundingBox();

test.describe("primary side bar side", () => {
  test("Move primary side bar right puts the rail right of main, survives reload, and moves back", async ({ page, baseURL }) => {
    await openDesktop(page, baseURL);
    const before = await railBox(page);
    expect(before.x).toBeLessThan((await mainBox(page)).x);
    await chooseViewAppearance(page, "Move primary side bar right");
    await expect.poll(async () => (await railBox(page)).x).toBeGreaterThan((await mainBox(page)).x);
    await expect(sidebar(page)).toHaveAttribute("data-sidebar-side", "right");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(sidebar(page)).toHaveAttribute("data-sidebar-side", "right");
    expect((await railBox(page)).x).toBeGreaterThan((await mainBox(page)).x);
    await chooseViewAppearance(page, "Move primary side bar left");
    await expect(sidebar(page)).toHaveAttribute("data-sidebar-side", "left");
  });

  test("on the right the resize handle comes first in the DOM and dragging it left widens the panel", async ({ page, baseURL }) => {
    await openDesktop(page, baseURL);
    await chooseViewAppearance(page, "Move primary side bar right");
    await expect(sidebar(page)).toHaveAttribute("data-sidebar-side", "right");
    const order = await sidebar(page).evaluate((el) => Array.from(el.children).map((c) => c.getAttribute("role") ?? c.tagName));
    expect(order[0]).toBe("separator");
    const handle = page.getByRole("separator", { name: "Resize sidebar" });
    const width = async () => Number(await handle.getAttribute("aria-valuenow"));
    const start = await width();
    const box = await handle.boundingBox();
    await page.mouse.move(box.x - 2, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x - 42, box.y + 200, { steps: 6 });
    await page.mouse.up();
    await expect.poll(width).toBeGreaterThan(start);
  });

  test("a phone ignores the setting and never scrolls sideways", async ({ page, baseURL }) => {
    await openDesktop(page, baseURL);
    await chooseViewAppearance(page, "Move primary side bar right");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(sidebar(page)).toHaveAttribute("data-sidebar-side", "left");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect((await railBox(page)).x).toBeLessThan((await mainBox(page)).x + 1);
  });
});

const bodyOf = (page) => page.getByTestId("workbench-body");
const dockOf = (page) => page.getByTestId("workbench-dock");
const gridOf = (page) => page.getByTestId("workbench-grid");
const rectOf = (locator) => locator.evaluate((el) => el.getBoundingClientRect().toJSON());

async function openDock(page, baseURL) {
  await openDesktop(page, baseURL);
  if (!(await dockOf(page).isVisible())) await page.keyboard.press("Control+j");
  await dockOf(page).waitFor();
}

test.describe("maximize panel", () => {
  test("the chevron fills the body, keeps the editor mounted, and Hide panel restores", async ({ page, baseURL }) => {
    await openDock(page, baseURL);
    await page.evaluate(() => { document.querySelector('[data-testid="workbench-grid"]').firstElementChild.__osioMark = "editor"; });
    const maximize = dockOf(page).getByRole("button", { name: "Maximize panel size" });
    await expect(maximize).toHaveAttribute("aria-pressed", "false");
    await maximize.click();
    await expect(bodyOf(page)).toHaveAttribute("data-dock-maximized", "true");
    await expect(gridOf(page)).toBeHidden();
    const [body, dock] = [await rectOf(bodyOf(page)), await rectOf(dockOf(page))];
    expect(dock.height).toBeGreaterThan(body.height - 40);
    expect(dock.width).toBeGreaterThan(body.width - 40);
    const restore = dockOf(page).getByRole("button", { name: "Restore panel size" });
    await expect(restore).toHaveAttribute("aria-pressed", "true");
    await restore.click();
    await expect(bodyOf(page)).not.toHaveAttribute("data-dock-maximized", "true");
    await expect(gridOf(page)).toBeVisible();
    expect(await page.evaluate(() => document.querySelector('[data-testid="workbench-grid"]').firstElementChild.__osioMark)).toBe("editor");
    await dockOf(page).getByRole("button", { name: "Maximize panel size" }).click();
    await dockOf(page).getByRole("button", { name: "Hide panel" }).click();
    await expect(dockOf(page)).toBeHidden();
    await page.keyboard.press("Control+j");
    await expect(dockOf(page)).toBeVisible();
    await expect(bodyOf(page)).not.toHaveAttribute("data-dock-maximized", "true");
    await expect(gridOf(page)).toBeVisible();
  });

  test("a side dock uses the same button and the Appearance row follows the state", async ({ page, baseURL }) => {
    await openDock(page, baseURL);
    await dockOf(page).getByRole("button", { name: "Panel position" }).click();
    await page.getByRole("menuitemradio", { name: "Right", exact: true }).click();
    await dockOf(page).getByRole("button", { name: "Maximize panel size" }).click();
    await expect(bodyOf(page)).toHaveAttribute("data-dock-maximized", "true");
    await page.getByTestId("customize-layout").click();
    await expect(page.getByRole("menuitemcheckbox", { name: "Maximize panel" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("menuitemcheckbox", { name: "Maximize panel" }).click();
    await expect(bodyOf(page)).not.toHaveAttribute("data-dock-maximized", "true");
  });
});

test.describe("customize layout", () => {
  test("one menu holds every layout switch and returns focus on Escape", async ({ page, baseURL }) => {
    await openDesktop(page, baseURL);
    const button = page.getByTestId("customize-layout");
    await expect(button).toHaveAttribute("aria-haspopup", "menu");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitemcheckbox", { name: "Status bar" })).toHaveAttribute("aria-checked", "true");
    await expect(menu.getByRole("menuitemcheckbox", { name: "Bottom" })).toHaveAttribute("aria-checked", "true");
    await expect(menu.getByRole("menuitemcheckbox", { name: "Left" })).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(button).toBeFocused();
  });

  test("Status bar toggles off and on, and Panel position Right moves the dock", async ({ page, baseURL }) => {
    await openDock(page, baseURL);
    const status = page.getByTestId("workbench-statusbar");
    const button = page.getByTestId("customize-layout");
    const hadStatus = await status.count();
    await button.click();
    await page.getByRole("menuitemcheckbox", { name: "Status bar" }).click();
    await expect(status).toHaveCount(hadStatus ? 0 : 1);
    await button.click();
    await page.getByRole("menuitemcheckbox", { name: "Status bar" }).click();
    await expect(status).toHaveCount(hadStatus);
    await button.click();
    await page.getByRole("menuitemcheckbox", { name: "Right" }).click();
    await expect(bodyOf(page)).toHaveAttribute("data-dock-position", "right");
    const [grid, dock] = [await rectOf(gridOf(page)), await rectOf(dockOf(page))];
    expect(dock.left).toBeGreaterThanOrEqual(grid.right - 1);
  });

  test("the keyboard opens, moves and runs a row", async ({ page, baseURL }) => {
    await openDock(page, baseURL);
    const button = page.getByTestId("customize-layout");
    await button.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.getByRole("menuitemcheckbox", { name: "Left" }).focus();
    await page.keyboard.press("Enter");
    await expect(bodyOf(page)).toHaveAttribute("data-dock-position", "left");
    await expect(page.getByRole("menu")).toHaveCount(0);
  });
});
