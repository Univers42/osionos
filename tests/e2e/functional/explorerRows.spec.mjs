// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   explorerRows.spec.mjs                              :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// The sidebar Explorer wears the Calm canvas row language: a file-tree row, a
// Recents page row and a section label are one family, and the IDE states
// (toolbar, empty, offline sandbox) use the kit controls.

import { expect, test } from "@playwright/test";

import { explorerRow } from "../../browser/core/app.mjs";
import { tokenValue } from "../support/styleguideHelpers.mjs";

const ROW_LOOK = ["height", "borderTopLeftRadius", "paddingLeft", "fontSize", "fontWeight", "color"];
const FILES = '[data-sidebar-panel="files"]';

const read = (locator, properties) =>
  locator.evaluate((el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))])), properties);

// The tree row is the li's inner div; the Recents row is the kit SidebarNavItem's outer div.
const treeRow = (page, title) => explorerRow(page, title).locator("> div");
const pageRow = (page, title) => page.locator(FILES).getByRole("button", { name: new RegExp(title) }).first().locator("xpath=..");

async function bootExplorer(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem("osio:perf", "1"));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("treeitem").first().waitFor({ timeout: 60_000 });
}

async function visitTwoPages(page) {
  await explorerRow(page, "Getting Started").click();
  await explorerRow(page, "Project Roadmap").click();
  await page.mouse.move(700, 500);
}

test("a file row and a page row share height, radius, indent, type and colour", async ({ page }) => {
  test.setTimeout(120_000);
  await bootExplorer(page);
  await visitTwoPages(page);
  // Getting Started is idle in both lists; Project Roadmap is the open page in both.
  expect(await read(treeRow(page, "Getting Started"), ROW_LOOK)).toEqual(await read(pageRow(page, "Getting Started"), ROW_LOOK));
  const open = ["backgroundColor", "color"];
  expect(await read(treeRow(page, "Project Roadmap"), open)).toEqual(await read(pageRow(page, "Project Roadmap"), open));
  expect((await read(treeRow(page, "Project Roadmap"), ["backgroundColor"])).backgroundColor).toBe(await tokenValue(page, "background-color", "--osio-bg-muted"));
});

test("a file row and a page row paint the same hover fill", async ({ page }) => {
  test.setTimeout(120_000);
  await bootExplorer(page);
  await visitTwoPages(page);
  await treeRow(page, "Getting Started").hover();
  const fill = await tokenValue(page, "background-color", "--osio-bg-hover");
  await expect.poll(async () => (await read(treeRow(page, "Getting Started"), ["backgroundColor"])).backgroundColor).toBe(fill);
  await pageRow(page, "Getting Started").hover();
  await expect.poll(async () => (await read(pageRow(page, "Getting Started"), ["backgroundColor"])).backgroundColor).toBe(fill);
});

test("nesting indents by the page row's step, from the page row's gutter", async ({ page }) => {
  test.setTimeout(120_000);
  await bootExplorer(page);
  await visitTwoPages(page);
  await page.evaluate(() => globalThis.__perfSeedFolder(3));
  await treeRow(page, "perf-folder").click();
  const child = treeRow(page, "file-0000.ts");
  await expect(child).toBeVisible();
  const [folder, nested, kit] = [await read(treeRow(page, "perf-folder"), ["paddingLeft"]), await read(child, ["paddingLeft"]), await read(pageRow(page, "Getting Started"), ["paddingLeft"])];
  expect(folder.paddingLeft).toBe(kit.paddingLeft);
  expect(parseFloat(nested.paddingLeft) - parseFloat(folder.paddingLeft)).toBe(12);
});

test("a focused tree row shows the global focus ring, as a page row does", async ({ page }) => {
  test.setTimeout(120_000);
  await bootExplorer(page);
  await visitTwoPages(page);
  const ring = (el) => el.evaluate((node) => { const css = getComputedStyle(node); return { style: css.outlineStyle, width: css.outlineWidth, offset: css.outlineOffset }; });
  await page.keyboard.press("Tab");
  const row = explorerRow(page, "Getting Started");
  const button = page.locator(FILES).getByRole("button", { name: /Getting Started/ }).first();
  await row.focus();
  const treeRing = await ring(row);
  await button.focus();
  expect(treeRing).toEqual(await ring(button));
  expect(treeRing.style).toBe("solid");
});

test("section labels and the toolbar follow the sidebar's sentence-case style", async ({ page }) => {
  test.setTimeout(120_000);
  await bootExplorer(page);
  await visitTwoPages(page);
  const look = ["textTransform", "letterSpacing", "fontWeight", "fontSize", "color"];
  const recents = await read(page.locator(FILES).getByRole("button", { name: "Recents", exact: true }).locator("span").first(), look);
  const files = await read(page.locator(`${FILES} [data-section-label]`, { hasText: "Files" }), look);
  expect(files).toEqual(recents);
  expect(files).toMatchObject({ textTransform: "none", letterSpacing: "normal", fontWeight: "500" });
  expect(files.color).toBe(await tokenValue(page, "color", "--osio-fg-muted"));

  const toolbar = page.getByRole("toolbar", { name: "Workspace files actions" });
  for (const button of await toolbar.getByRole("button").all()) {
    expect(await button.getAttribute("title")).toBeNull();
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(24);
    expect(box.height).toBeGreaterThanOrEqual(24);
  }
});

test("the view switch is a segmented track with a raised selected segment", async ({ page }) => {
  test.setTimeout(120_000);
  await bootExplorer(page);
  const tree = page.locator(FILES).getByRole("button", { name: "Tree", exact: true });
  const gallery = page.locator(FILES).getByRole("button", { name: "Gallery", exact: true });
  await expect(tree).toHaveAttribute("aria-pressed", "true");
  expect((await read(tree, ["backgroundColor"])).backgroundColor).toBe(await tokenValue(page, "background-color", "--osio-bg-surface"));
  expect((await read(tree, ["height"])).height).toBe(await tokenValue(page, "height", "--osio-control-h-sm"));
  expect((await read(gallery, ["backgroundColor"])).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect((await read(tree.locator("xpath=.."), ["backgroundColor"])).backgroundColor).toBe(await tokenValue(page, "background-color", "--osio-bg-subtle"));
});

test("the inline new-file field opens inside its row without moving the lines below it", async ({ page }) => {
  test.setTimeout(120_000);
  await bootExplorer(page);
  const first = explorerRow(page, "Getting Started");
  await page.getByRole("button", { name: "New file", exact: true }).first().click();
  const input = page.locator('[role="tree"] input');
  await expect(input).toBeVisible();
  const row = await input.locator("xpath=..").boundingBox();
  const rowHeight = await tokenValue(page, "height", "--osio-control-h-xs");
  expect(row.height).toBe(28);
  expect((await input.boundingBox()).height).toBe(parseFloat(rowHeight));
  expect(await read(input, ["borderTopLeftRadius"])).toEqual({ borderTopLeftRadius: await tokenValue(page, "border-top-left-radius", "--osio-field-radius") });
  await expect(first).toBeVisible();
});

test("the offline sandbox state is a muted icon, a title and a kit Retry button", async ({ page }) => {
  test.setTimeout(120_000);
  await bootExplorer(page);
  await page.getByRole("button", { name: "Panel", exact: true }).click();
  const state = page.getByTestId("workbench-dock").getByRole("status").filter({ hasText: /Sandbox (unavailable|disabled|stopped)/ });
  await expect(state).toBeVisible({ timeout: 30_000 });
  await expect(state.locator("svg").first()).toBeVisible();
  const retry = state.getByRole("button", { name: "Retry" });
  expect((await read(retry, ["height"])).height).toBe(await tokenValue(page, "height", "--osio-control-h-sm"));
  expect((await read(retry, ["borderTopLeftRadius"])).borderTopLeftRadius).toBe(await tokenValue(page, "border-top-left-radius", "--osio-control-radius"));
});

test("the row menu marks Delete as the destructive item, like the page options menu", async ({ page }) => {
  test.setTimeout(120_000);
  await bootExplorer(page);
  await explorerRow(page, "Getting Started").click({ button: "right" });
  const remove = page.getByRole("menu").getByRole("menuitem", { name: "Delete", exact: true });
  await expect(remove).toHaveAttribute("data-tone", "danger");
  expect((await read(remove, ["color"])).color).toBe(await tokenValue(page, "color", "--osio-danger"));
  await expect(page.getByRole("menu").getByRole("menuitem", { name: "Rename", exact: true })).not.toHaveAttribute("data-tone", /.+/);
});
