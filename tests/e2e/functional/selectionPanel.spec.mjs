// The Notion vertical selection panel: below the selection, turn-into row,
// 5 x 2 format grid, comment row, skills and the Edit with AI row. The two
// screenshots this spec leaves in test-results are the side-by-side artefacts.

import { expect, test } from "@playwright/test";

import {
  activateFirstEditor,
  clearAndType,
  openFreshPage,
  selectText,
  toolbarButton,
} from "../../browser/core/app.mjs";

const PANEL = '[data-testid="inline-selection-toolbar"]';

const GRID_BUTTONS = [
  "Text color",
  "Bold",
  "Italic",
  "Underline",
  "Clear formatting",
  "Add link",
  "Strikethrough",
  "Inline code",
  "Equation",
  "More",
];

async function selectionRect(page) {
  return page.evaluate(() => {
    const selection = globalThis.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
  });
}

async function openPanel(page, baseURL) {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await clearAndType(editor, "alpha beta gamma");
  await selectText(editor, "alpha");
  await page.getByTestId("inline-selection-toolbar").waitFor();
  await page.screenshot({ path: "test-results/selpanel-after.png" });
  return editor;
}

test.describe("selection panel", () => {
  test("sits below the selection, reads Normal Text, and shows the 10-cell grid", async ({ page, baseURL }) => {
    await openPanel(page, baseURL);
    const panel = page.getByTestId("inline-selection-toolbar");
    const selected = await selectionRect(page);
    const panelBox = await panel.boundingBox();

    expect(selected).not.toBeNull();
    expect(panelBox).not.toBeNull();
    expect(panelBox.y).toBeGreaterThan(selected.bottom);
    expect(panelBox.width).toBeGreaterThan(250);

    await expect(toolbarButton(page, "Turn into")).toContainText("Normal Text");
    for (const title of GRID_BUTTONS) {
      await expect(toolbarButton(page, title)).toBeVisible();
    }

    // The editor always passes its onAskAI handler, which is the gate the old
    // Ask AI menu used, so the skills block is present in this build.
    await expect(panel.getByText("Skills", { exact: true })).toBeVisible();
    for (const label of ["Improve writing", "Proofread", "Explain", "Reformat"]) {
      await expect(page.getByRole("menuitem", { name: label, exact: true })).toBeVisible();
    }
    await expect(toolbarButton(page, "Ask AI")).toContainText("Edit with AI");
    await expect(toolbarButton(page, "Comment")).toBeVisible();

    await page.screenshot({ path: "test-results/selpanel-after.png" });
  });

  test("the turn-into flyout opens to the right with a check on the current type", async ({ page, baseURL }) => {
    await openPanel(page, baseURL);
    const panelBox = await page.getByTestId("inline-selection-toolbar").boundingBox();
    await toolbarButton(page, "Turn into").click();
    const menu = page.getByRole("menu", { name: "Turn into" });
    await expect(menu).toBeVisible();
    const menuBox = await menu.boundingBox();

    expect(panelBox).not.toBeNull();
    expect(menuBox).not.toBeNull();
    expect(menuBox.x).toBeGreaterThanOrEqual(panelBox.x + panelBox.width);
    await expect(
      menu.getByRole("menuitem", { name: "Text", exact: true }).getByTestId("turn-into-current-check"),
    ).toBeVisible();
    await expect(page.getByTestId("block-type-preview")).toBeVisible();

    await page.screenshot({ path: "test-results/selpanel-flyout.png" });
  });

  test("Bold still bolds the selection and Escape closes the panel", async ({ page, baseURL }) => {
    const editor = await openPanel(page, baseURL);
    await toolbarButton(page, "Bold").click();
    await expect(editor.locator("strong")).toHaveCount(1);

    await selectText(editor, "alpha");
    await page.getByTestId("inline-selection-toolbar").waitFor();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("inline-selection-toolbar")).toHaveCount(0);
  });

  test("renders in under 20 ms after the selection changes", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await clearAndType(editor, "alpha beta gamma");

    await page.evaluate(() => {
      const editor = document.querySelector('[role="textbox"][aria-multiline="true"]');
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node && (node.nodeValue || "").length < 5) node = walker.nextNode();
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, 5);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);

      window.__perf = { started: 0, panelTime: 0 };
      const observer = new MutationObserver(() => {
        if (
          document.querySelector('[data-testid="inline-selection-toolbar"]') &&
          !window.__perf.panelTime
        ) {
          window.__perf.panelTime = performance.now();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      window.__perf.started = performance.now();
      document.dispatchEvent(new Event("selectionchange"));
    });

    await page.getByTestId("inline-selection-toolbar").waitFor({ timeout: 5000 });
    const result = await page.evaluate(() => ({
      started: window.__perf.started,
      panelTime: window.__perf.panelTime,
      renderMs:
        window.__perf.started && window.__perf.panelTime
          ? window.__perf.panelTime - window.__perf.started
          : -1,
    }));
    console.log("SELPANEL_PERF", JSON.stringify(result));
    expect(result.renderMs, `started=${result.started}`).toBeGreaterThanOrEqual(0);
    expect(result.renderMs, `panel rendered in ${result.renderMs} ms`).toBeLessThan(20);
  });
});
