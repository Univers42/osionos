// ************************************************************************** //
//                                                                            //
//   pageSurfaces.spec.mjs                                                    //
//                                                                            //
// ************************************************************************** //

// The surfaces a page gains from the workbench merge wear the Calm canvas chrome: the
// file-conflict banner is a warning callout in the page column, and the code file's
// footer reads the code tokens with hit targets a pointer can land on.

import { expect, test } from "@playwright/test";

import { clearAndTypePageTitle, openFreshPage } from "../../browser/core/app.mjs";
import { computed, tokenValue } from "../support/styleguideHelpers.mjs";

const BANNER_TEXT = "The file version of this page changed too.";
const MIN_TARGET_PX = 24;

async function activePageId(page) {
  return page.evaluate(async () => (await import("/src/store/usePageStore.ts")).usePageStore.getState().activePage?.id);
}

async function reportConflict(page, pageId) {
  await page.evaluate(async (id) => {
    const { useIdeSyncConflicts } = await import("/src/features/ide/model/ideSyncConflicts.ts");
    useIdeSyncConflicts.getState().report({ relPath: "plan.md", pageId: id, theirs: "x", theirsHash: "h", atMs: 1 });
  }, pageId);
}

// Contrast of two CSS colours, the way the page paints them (WCAG 2 relative luminance).
const contrast = (page, foreground, background) =>
  page.evaluate(([fg, bg]) => {
    const luminance = (color) => {
      const ctx = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d");
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  }, [foreground, background]);

test.describe("the page-file conflict banner", () => {
  test("is a warning callout in the page column, with kit buttons", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshPage(page, baseURL);
    await clearAndTypePageTitle(page, "Conflict page");
    await reportConflict(page, await activePageId(page));

    const banner = page.getByRole("status").filter({ hasText: BANNER_TEXT });
    await expect(banner).toBeVisible();

    const radius = await tokenValue(page, "border-top-left-radius", "--osio-radius-control");
    expect(await computed(banner, "border-top-left-radius")).toBe(radius);
    expect(await computed(banner, "background-color")).not.toBe("rgba(0, 0, 0, 0)");
    expect(await contrast(page, await computed(banner, "color"), await computed(banner, "background-color"))).toBeGreaterThanOrEqual(4.5);

    // Aligned with the column the title and the body share, not full-bleed.
    const column = await page.locator(".osionos-page-body").evaluate((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { left: box.left + parseFloat(style.paddingLeft), right: box.right - parseFloat(style.paddingRight) };
    });
    const box = await banner.boundingBox();
    expect(Math.abs(box.x - column.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.x + box.width - column.right)).toBeLessThanOrEqual(1);

    for (const name of ["Keep mine", "Take file"]) {
      const button = banner.getByRole("button", { name });
      const { height } = await button.boundingBox();
      expect(height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      expect(await computed(button, "border-top-left-radius")).toBe(radius);
    }
  });
});

test.describe("a code file's footer", () => {
  test("its buttons are at least 24px tall and read the code tokens", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshPage(page, baseURL);
    await clearAndTypePageTitle(page, "Conflict page");
    const pageId = await activePageId(page);
    await page.evaluate(async (id) => {
      const { usePageStore } = await import("/src/store/usePageStore.ts");
      usePageStore.getState().patchPage(id, { surface: "code", title: "main.py" });
    }, pageId);

    const footer = page.locator("[data-osio-ide] > div").last();
    const run = footer.getByRole("button", { name: /Run/ });
    await expect(run).toBeVisible();
    const radius = await tokenValue(page, "border-top-left-radius", "--osio-radius-control");
    for (const button of [run, footer.getByRole("button", { name: /Format/ }), footer.getByRole("button", { name: "Toggle terminal" })]) {
      const { height, width } = await button.boundingBox();
      expect(height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      expect(width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      expect(await computed(button, "border-top-left-radius")).toBe(radius);
    }
  });
});
