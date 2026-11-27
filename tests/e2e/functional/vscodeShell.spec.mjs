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
    await page.locator("body").press("Escape");
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
});
