// Tab dragging motion: a carried tab folds away, its neighbours part to open a gap where it would
// land, the drop is index-aware, and a tab dropped on a pane edge splits into a pane that grows in.
// Caveat: the drag is dispatched as synthetic DragEvents sharing one DataTransfer (Playwright's
// mouse cannot pause mid-drag to read the strip), so the browser's own drag image and its
// dragenter/dragleave ordering are not exercised — usePaneDnd and useTabStripDrop only read
// dragover/drop/dragend, which is what this drives.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const strip = (page) => page.locator("[data-osio-pane] [data-drop-list]").first();
const stripTabIds = (page) => strip(page).evaluate((list) => [...list.querySelectorAll(":scope > [data-drop-item]")].map((tab) => tab.dataset.tabId));

async function seed(page, appearance) {
  await page.route("**/*", (route) => (route.request().method() === "GET" ? route.fallback() : route.abort()));
  await page.addInitScript((raw) => {
    if (sessionStorage.getItem("drag-seeded")) return;
    sessionStorage.setItem("drag-seeded", "1");
    localStorage.setItem("osionos:theme-mode", "light");
    if (raw !== null) localStorage.setItem("osionos:appearance", raw);
  }, appearance === undefined ? null : JSON.stringify(appearance));
}

async function openThreeTabs(page, baseURL) {
  await openFreshPage(page, baseURL);
  for (let created = 0; created < 2; created += 1) {
    const before = (await stripTabIds(page)).length;
    await page.getByRole("button", { name: /New page/i }).first().click();
    await expect.poll(async () => (await stripTabIds(page)).length).toBe(before + 1);
  }
  return stripTabIds(page);
}

function startDrag(page, tabId) {
  return page.evaluate(async ({ id }) => {
    const source = document.querySelector(`[data-tab-id="${CSS.escape(id)}"]`);
    window.__drag = { id, data: new DataTransfer() };
    const box = source.getBoundingClientRect();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: window.__drag.data, clientX: box.left + 4, clientY: box.top + 4 }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, { id: tabId });
}

/** Dispatches a dragover or drop on whatever is under (x, y), the way the browser would. */
function dragEventAt(page, type, x, y) {
  return page.evaluate(async ({ type, x, y }) => {
    document.elementFromPoint(x, y).dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: window.__drag.data, clientX: x, clientY: y }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, { type, x, y });
}

function endDrag(page) {
  return page.evaluate(async () => {
    const source = document.querySelector(`[data-tab-id="${CSS.escape(window.__drag.id)}"]`);
    source?.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: window.__drag.data }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

/** A viewport point a fraction of the way across the strip's index-th tab, at its resting box. */
function restingPoint(page, index, fraction) {
  return strip(page).evaluate((list, { index, fraction }) => {
    const tab = list.querySelectorAll(":scope > [data-drop-item]")[index];
    const box = list.getBoundingClientRect();
    return { x: box.left - list.scrollLeft + tab.offsetLeft + tab.offsetWidth * fraction, y: box.top + box.height / 2 };
  }, { index, fraction });
}

test.describe("tab dragging motion", () => {
  test("Slide: the carried tab folds, the tabs past the gap slide, and the drop lands where the gap was", async ({ page, baseURL }) => {
    await seed(page);
    const [first, second, third] = await openThreeTabs(page, baseURL);
    await startDrag(page, first);
    const source = strip(page).locator(`[data-tab-id="${first}"]`);
    await expect(source).toHaveAttribute("data-drag-source", "");
    await expect.poll(() => source.evaluate((tab) => tab.offsetWidth)).toBe(0);

    const target = await restingPoint(page, 2, 0.25);
    await dragEventAt(page, "dragover", target.x, target.y);
    await expect(strip(page).locator(`[data-tab-id="${third}"]`)).toHaveAttribute("data-drop-shift", "");
    await expect(strip(page).locator(`[data-tab-id="${second}"]`)).not.toHaveAttribute("data-drop-shift", /.*/);
    await expect(strip(page).locator(".osio-tab-slot")).toHaveCount(1);

    await dragEventAt(page, "drop", target.x, target.y);
    await endDrag(page);
    expect((await stripTabIds(page)).slice(0, 3)).toEqual([second, first, third]);
    await expect(strip(page).locator(".osio-tab-slot")).toHaveCount(0);
    await expect(strip(page).locator("[data-drag-source], [data-drop-shift]")).toHaveCount(0);
  });

  test("Line: the carried tab stays in place, dimmed, and the gap is a thin bar", async ({ page, baseURL }) => {
    await seed(page, { dragMotion: "line" });
    const [first] = await openThreeTabs(page, baseURL);
    await expect(page.locator("html")).toHaveAttribute("data-drag-motion", "line");
    await startDrag(page, first);
    const source = strip(page).locator(`[data-tab-id="${first}"]`);
    await expect.poll(() => source.evaluate((tab) => getComputedStyle(tab).opacity)).toBe("0.5");
    expect(await source.evaluate((tab) => tab.offsetWidth)).toBeGreaterThan(0);
    const target = await restingPoint(page, 2, 0.25);
    await dragEventAt(page, "dragover", target.x, target.y);
    await expect.poll(() => strip(page).locator(".osio-tab-slot").evaluate((slot) => slot.offsetWidth)).toBe(2);
    await expect(strip(page).locator("[data-drop-shift]").first()).toHaveCSS("transform", "none");
    await endDrag(page);
  });

  test("a tab dropped on a pane's right edge shows the zone, then splits into a pane that grows in", async ({ page, baseURL }) => {
    await seed(page);
    const [, second] = await openThreeTabs(page, baseURL);
    await startDrag(page, second);
    const body = await page.locator("[data-osio-pane]").first().boundingBox();
    const edge = { x: body.x + body.width - 8, y: body.y + body.height * 0.6 };
    await dragEventAt(page, "dragover", edge.x, edge.y);
    await expect(page.locator('[data-drop-zone="right"]')).toBeVisible();
    await dragEventAt(page, "drop", edge.x, edge.y);
    await endDrag(page);
    const panes = page.locator("[data-osio-pane]");
    await expect(panes).toHaveCount(2);
    await expect(panes.nth(0)).not.toHaveAttribute("data-pane-enter", /.*/);
    await expect(panes.nth(1)).toHaveAttribute("data-pane-enter", "");
    await expect(panes.nth(1).locator(`[data-tab-id="${second}"]`)).toHaveCount(1);
  });
});
