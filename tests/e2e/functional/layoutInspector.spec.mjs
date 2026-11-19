/* ************************************************************************** */
/*                                                                            */
/*   layoutInspector.spec.mjs                                                 */
/*                                                                            */
/*   With osio.layout.modes on, the block menu's Layout entry opens an        */
/*   inspector on a column list: Grid and 3 columns render at once, survive  */
/*   a reload, and one undo per choice takes them back. The popover is       */
/*   reached by keyboard, passes axe, and gives focus back to the handle.    */
/*   Off, the entry is not there (ADR 0064 PS2, PS6, PS10).                  */
/*                                                                            */
/* ************************************************************************** */

// Caveat: axe proves only the machine-checkable WCAG failures absent; label wording and
// focus order inside the popover are asserted below, the rest needs a human pass.

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { explorerRow } from "../../browser/core/app.mjs";
import { seedPage } from "../support/embedSeed.mjs";

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const para = (id, content) => ({ id, type: "paragraph", content });
const col = (id, text) => ({ id, type: "column", content: "", children: [para(`${id}-p`, text)] });
const CARDS = [{
  id: "cards", type: "column_list", content: "",
  children: [col("c1", "Card one"), col("c2", "Card two"), col("c3", "Card three")],
}];

// The kept-alive Home pane may mount a hidden second editor of the same page, so only
// the visible one counts.
const listArticle = (page) => page.locator('[data-draggable-block-id="cards"]').filter({ visible: true });
const listHandle = (page) => listArticle(page).locator('> [data-testid="block-drag-handle"]');
const inspector = (page) => page.getByTestId("layout-inspector");
const listRow = (page) => listArticle(page).locator(".osio-columns-row");
const rowDisplay = (page) => listRow(page).evaluate((row) => getComputedStyle(row).display);

async function openCards(page, baseURL, flagOn) {
  await page.addInitScript((on) => (on ? localStorage.setItem("osio.layout.modes", "1") : localStorage.removeItem("osio.layout.modes")), flagOn);
  await seedPage(page, baseURL, CARDS);
  await expect(listArticle(page).getByText("Card three")).toBeVisible();
}

/** By keyboard: a column list's handle sits under its first column's child handle, which
 *  takes the pointer (hoverBehavior covers which one shows), so Enter on the focused handle. */
async function openBlockMenu(page) {
  await listHandle(page).focus();
  await page.keyboard.press("Enter");
  const menu = page.getByTestId("block-context-menu");
  await expect(menu).toBeVisible();
  return menu;
}

async function openInspector(page) {
  await (await openBlockMenu(page)).getByRole("menuitem", { name: "Layout" }).click();
  await expect(inspector(page)).toBeVisible();
}

/** The popover fades in from opacity 0 once placed; axe's contrast check needs it opaque. */
async function settled(page) {
  await page.waitForFunction(() => {
    for (let node = document.querySelector('[data-testid="layout-inspector"]'); node; node = node.parentElement) {
      if (getComputedStyle(node).opacity !== "1") return false;
    }
    return true;
  });
}

async function chooseGridOfThree(page) {
  await inspector(page).getByRole("tab", { name: "Grid" }).click();
  await inspector(page).getByLabel("Columns").selectOption("3");
  await expect.poll(() => rowDisplay(page)).toBe("grid");
}

async function cardTops(page) {
  return Promise.all(["Card one", "Card two", "Card three"].map(async (text) =>
    Math.round((await listRow(page).locator(":scope > div", { hasText: text }).boundingBox()).y)));
}

test("Grid and 3 columns render at once and survive a reload", async ({ page, baseURL }) => {
  await openCards(page, baseURL, true);
  expect(await rowDisplay(page)).toBe("flex");
  await openInspector(page);
  await chooseGridOfThree(page);
  const [one, two, three] = await cardTops(page);
  expect(Math.abs(one - two)).toBeLessThanOrEqual(1);
  expect(Math.abs(one - three)).toBeLessThanOrEqual(1);

  await page.keyboard.press("Escape");
  await expect(inspector(page)).toHaveCount(0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await explorerRow(page, "Embed seed").click();
  await expect(listArticle(page).getByText("Card three")).toBeVisible();
  expect(await rowDisplay(page)).toBe("grid");
});

test("each choice is one undo step and undo restores today's row", async ({ page, baseURL }) => {
  await openCards(page, baseURL, true);
  await openInspector(page);
  await chooseGridOfThree(page);
  await listArticle(page).getByText("Card two").click();
  await expect(inspector(page)).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect.poll(() => listRow(page).getAttribute("data-s-cols")).toBeNull();
  expect(await rowDisplay(page)).toBe("grid");
  await page.keyboard.press("Control+z");
  await expect.poll(() => rowDisplay(page)).toBe("flex");
});

test("keyboard: Enter opens it, controls are labelled, Escape returns focus to the handle, axe is clean", async ({ page, baseURL }) => {
  await openCards(page, baseURL, true);
  const menu = await openBlockMenu(page);
  await menu.getByRole("menuitem", { name: "Layout" }).focus();
  await page.keyboard.press("Enter");
  await expect(inspector(page)).toBeVisible();
  await expect(inspector(page)).toHaveAccessibleName("Layout");
  await expect(inspector(page).getByRole("tab", { name: "Row" })).toBeFocused();
  await expect(inspector(page).getByLabel("Gap")).toBeVisible();

  await inspector(page).getByRole("button", { name: "More options" }).click();
  await expect(inspector(page).getByLabel("Align items")).toBeVisible();
  await expect(inspector(page).getByRole("switch", { name: "Wrap columns" })).toBeVisible();
  await settled(page);
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA).include('[data-testid="layout-inspector"]').analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);

  await inspector(page).getByLabel("Gap").focus();
  await page.keyboard.press("Escape");
  await expect(inspector(page)).toHaveCount(0);
  await expect(listHandle(page)).toBeFocused();
  await expect(listArticle(page)).toBeVisible();
});

test("Reset clears what the inspector wrote", async ({ page, baseURL }) => {
  await openCards(page, baseURL, true);
  await openInspector(page);
  await chooseGridOfThree(page);
  await inspector(page).getByRole("button", { name: "Reset" }).click();
  await expect.poll(() => rowDisplay(page)).toBe("flex");
  await expect(inspector(page).getByRole("tab", { name: "Row" })).toHaveAttribute("aria-selected", "true");
});

test("flag off: the block menu has no Layout entry", async ({ page, baseURL }) => {
  await openCards(page, baseURL, false);
  const menu = await openBlockMenu(page);
  await expect(menu.getByRole("menuitem").first()).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Layout" })).toHaveCount(0);
});
