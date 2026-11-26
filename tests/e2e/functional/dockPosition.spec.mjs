// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   dockPosition.spec.mjs                              :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// The dock can sit at the bottom, left or right of the editor area, is resized in each place by
// pointer and keyboard, is remembered across reloads, and is forced to the bottom on a phone. The
// terminal is a frame on this computer's own page: moving the dock must never remount or reload it.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const dockOf = (page) => page.getByTestId("workbench-dock");
const bodyOf = (page) => page.getByTestId("workbench-body");
const splitterOf = (page) => page.getByTestId("dock-splitter");
const rect = (locator) => locator.evaluate((el) => el.getBoundingClientRect().toJSON());
const number = async (locator, name) => Number(await locator.getAttribute(name));

async function ensureDockOpen(page) {
  if (!(await dockOf(page).isVisible())) await page.keyboard.press("Control+j");
  await dockOf(page).waitFor();
}

async function openDock(page, baseURL) {
  await openFreshPage(page, baseURL);
  await ensureDockOpen(page);
}

async function placeDock(page, label) {
  await dockOf(page).getByRole("button", { name: "Panel position" }).click();
  await page.getByRole("menuitemradio", { name: label, exact: true }).click();
  await expect(bodyOf(page)).toHaveAttribute("data-dock-position", label.toLowerCase());
}

/** The iframe load count once two reads 400 ms apart agree, so a load still in flight is counted. */
async function settledLoads(page) {
  let last = -1;
  await expect
    .poll(async () => {
      const now = await page.evaluate(() => globalThis.__osioLoads);
      const same = now === last;
      last = now;
      return same;
    }, { intervals: [400] })
    .toBe(true);
  return last;
}

const overlap = (aStart, aEnd, bStart, bEnd) => Math.min(aEnd, bEnd) - Math.max(aStart, bStart) > 0;

test.describe("placement", () => {
  test("the dock sits where the menu puts it, beside or under the editor grid", async ({ page, baseURL }) => {
    await openDock(page, baseURL);
    const grid = page.getByTestId("workbench-grid");
    await expect(bodyOf(page)).toHaveAttribute("data-dock-position", "bottom");
    for (const place of ["right", "left", "bottom"]) {
      await placeDock(page, place[0].toUpperCase() + place.slice(1));
      const [g, d] = [await rect(grid), await rect(dockOf(page))];
      if (place === "right") expect(d.left).toBeGreaterThanOrEqual(g.right - 1);
      if (place === "left") expect(d.right).toBeLessThanOrEqual(g.left + 1);
      if (place === "bottom") expect(d.top).toBeGreaterThanOrEqual(g.bottom - 1);
      const side = place !== "bottom";
      expect(side ? overlap(d.top, d.bottom, g.top, g.bottom) : overlap(d.left, d.right, g.left, g.right)).toBe(true);
    }
  });

  test("the position menu is a radio menu on the keyboard", async ({ page, baseURL }) => {
    await openDock(page, baseURL);
    const button = dockOf(page).getByRole("button", { name: "Panel position" });
    await expect(button).toHaveAttribute("aria-haspopup", "menu");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    const menu = page.getByRole("menu", { name: "Panel position" });
    await expect(menu.getByRole("menuitemradio")).toHaveText(["Bottom", "Left", "Right"]);
    await expect(menu.getByRole("menuitemradio", { name: "Bottom" })).toHaveAttribute("aria-checked", "true");
    await expect(menu.getByRole("menuitemradio", { name: "Bottom" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(bodyOf(page)).toHaveAttribute("data-dock-position", "right");
    await expect(menu).toHaveCount(0);
    await expect(button).toBeFocused();
    await button.click();
    await expect(menu.getByRole("menuitemradio", { name: "Right" })).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });
});

// The terminal is this computer's page in a frame: a remount, or even a move in the DOM, reloads it.
test("moving the dock never remounts or reloads the terminal", async ({ page, baseURL }) => {
  await openDock(page, baseURL);
  const frame = dockOf(page).locator('[data-osio-terminal] iframe[title="Terminal"]');
  await expect(frame).toHaveCount(1);
  await page.evaluate(() => {
    globalThis.__osioLoads = 0;
    document.addEventListener("load", (e) => { if (e.target instanceof HTMLIFrameElement) globalThis.__osioLoads += 1; }, true);
    document.querySelector("#dock-panel-terminal").__osioMark = "panel";
    document.querySelector("[data-osio-terminal]").__osioMark = "terminal";
  });
  const before = await settledLoads(page);
  for (const place of ["Right", "Left", "Bottom"]) {
    await placeDock(page, place);
    const marks = await page.evaluate(() => [document.querySelector("#dock-panel-terminal")?.__osioMark, document.querySelector("[data-osio-terminal]")?.__osioMark]);
    expect(marks).toEqual(["panel", "terminal"]);
  }
  expect(await settledLoads(page)).toBe(before);
  await expect(frame).toHaveCount(1);
});

test.describe("resize", () => {
  test("a side splitter is vertical and keys follow the side", async ({ page, baseURL }) => {
    await openDock(page, baseURL);
    await placeDock(page, "Right");
    const bar = splitterOf(page);
    await expect(bar).toHaveAttribute("aria-orientation", "vertical");
    const [min, max, start] = [await number(bar, "aria-valuemin"), await number(bar, "aria-valuemax"), await number(bar, "aria-valuenow")];
    expect(min).toBe(240);
    expect(start).toBeLessThan(max);
    await bar.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(bar).toHaveAttribute("aria-valuenow", String(Math.min(start + 16, max)));
    await page.keyboard.press("ArrowRight");
    await expect(bar).toHaveAttribute("aria-valuenow", String(start));
    await page.keyboard.press("End");
    await expect(bar).toHaveAttribute("aria-valuenow", String(max));
    expect(Math.round((await rect(dockOf(page))).width)).toBe(max);
    await page.keyboard.press("Home");
    await expect(bar).toHaveAttribute("aria-valuenow", "240");
    expect(Math.round((await rect(dockOf(page))).width)).toBe(240);
  });

  test("dragging toward the editor grows the dock on either side", async ({ page, baseURL }) => {
    await openDock(page, baseURL);
    for (const [place, direction] of [["Right", -1], ["Left", 1]]) {
      await placeDock(page, place);
      const bar = splitterOf(page);
      const box = await rect(bar);
      const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
      const before = await number(bar, "aria-valuenow");
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + direction * 40, y, { steps: 4 });
      await page.mouse.up();
      await expect(bar).toHaveAttribute("aria-valuenow", String(before + 40));
    }
  });
});

test("the position and the width are remembered across a reload", async ({ page, baseURL }) => {
  await openDock(page, baseURL);
  await placeDock(page, "Right");
  await splitterOf(page).focus();
  await page.keyboard.press("End");
  const max = await number(splitterOf(page), "aria-valuenow");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("[data-osio-workbench]").waitFor({ state: "visible", timeout: 60_000 });
  await ensureDockOpen(page);
  await expect(bodyOf(page)).toHaveAttribute("data-dock-position", "right");
  await expect(splitterOf(page)).toHaveAttribute("aria-valuenow", String(max));
});

test("a phone gets the bottom whatever is stored, and the desktop gets its choice back", async ({ page, baseURL }) => {
  await openDock(page, baseURL);
  await placeDock(page, "Right");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(bodyOf(page)).toHaveAttribute("data-dock-position", "bottom");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("[data-osio-workbench]").waitFor({ state: "visible", timeout: 60_000 });
  await ensureDockOpen(page);
  await expect(bodyOf(page)).toHaveAttribute("data-dock-position", "bottom");
  await expect(dockOf(page).getByRole("button", { name: "Panel position" })).toHaveCount(0);
  await expect(splitterOf(page)).toHaveAttribute("aria-orientation", "horizontal");
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(bodyOf(page)).toHaveAttribute("data-dock-position", "right");
  await expect(dockOf(page).getByRole("button", { name: "Panel position" })).toBeVisible();
});
