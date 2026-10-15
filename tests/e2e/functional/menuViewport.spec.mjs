// A menu's scroll region sizes itself to the room its position leaves, shows a
// fade where more rows wait, and a picker never leaves the viewport. The block
// menu used to stop at a fixed 400px, which hid its destructive row below the
// fold with nothing saying the list scrolls.

import { expect, test } from "@playwright/test";

import {
  activateFirstEditor,
  contextMenuItem,
  openBlockContextMenuForEditor,
  openFreshPage,
  openSlashMenuFromEditor,
  slashMenu,
  waitForRenderStability,
} from "../../browser/core/app.mjs";

const blockMenu = (page) => page.getByTestId("block-context-menu");
const region = (page) => blockMenu(page).getByRole("menu");

async function openBlockMenu(page, baseURL, viewport) {
  await page.setViewportSize(viewport);
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type("A block");
  await openBlockContextMenuForEditor(editor);
  await expect(blockMenu(page)).toBeVisible();
}

test.describe("block menu scroll region", () => {
  test("shows Delete without scrolling when the viewport has room", async ({ page, baseURL }) => {
    await openBlockMenu(page, baseURL, { width: 1440, height: 900 });
    await expect(contextMenuItem(page, "Delete")).toBeInViewport({ ratio: 1 });
    await expect(region(page)).not.toHaveAttribute("data-fade-bottom", /.*/);
    await expect(region(page)).not.toHaveAttribute("data-fade-top", /.*/);
  });

  test("fades its bottom edge while rows remain, and drops it at the end", async ({ page, baseURL }) => {
    await openBlockMenu(page, baseURL, { width: 1440, height: 560 });
    await expect(region(page)).toHaveAttribute("data-fade-bottom", "");
    await expect(region(page)).not.toHaveAttribute("data-fade-top", /.*/);
    expect(await region(page).evaluate((el) => getComputedStyle(el).maskImage)).not.toBe("none");

    await region(page).evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(region(page)).not.toHaveAttribute("data-fade-bottom", /.*/);
    await expect(region(page)).toHaveAttribute("data-fade-top", "");
    await expect(contextMenuItem(page, "Delete")).toBeInViewport({ ratio: 1 });
  });

  test("reaches Delete from the keyboard on a short viewport", async ({ page, baseURL }) => {
    await openBlockMenu(page, baseURL, { width: 1440, height: 560 });
    const del = contextMenuItem(page, "Delete");
    await page.getByLabel("Search actions").focus();
    for (let step = 0; step < 40 && !(await del.evaluate((el) => el === document.activeElement)); step += 1) {
      await page.keyboard.press("Tab");
    }
    await expect(del).toBeFocused();
    await expect(del).toBeInViewport({ ratio: 1 });
  });
});

test("slash menu fades its bottom edge when it has to scroll", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 420 });
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await openSlashMenuFromEditor(editor, "/");
  const list = slashMenu(page).getByRole("listbox");
  await expect(list).toHaveAttribute("data-fade-bottom", "");
  await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(list).not.toHaveAttribute("data-fade-bottom", /.*/);
});

test.describe("Relate picker stays inside the viewport", () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    test(`at ${viewport.width}x${viewport.height}`, async ({ page, baseURL }) => {
      await page.setViewportSize(viewport);
      await openFreshPage(page, baseURL);
      await page.evaluate(async () => {
        const { usePageStore } = await import("/src/store/usePageStore.ts");
        const store = usePageStore.getState();
        store.patchPage(store.activePage?.id, {
          properties: [{ key: "related", label: "Related", type: "relation", value: ["gone-1", "gone-2", "gone-3"] }],
        });
      });
      await waitForRenderStability(page);
      // The phone layout can show the home page's own relation fields as well; the last one is lowest on screen, where clipping is worst.
      const trigger = page.getByRole("button", { name: "Relate" }).last();
      await trigger.click();
      const picker = page.getByTestId("relation-picker");
      await expect(picker).toBeVisible();
      const panel = picker.locator("xpath=..");
      await expect(panel).toBeInViewport({ ratio: 1 });
      const box = await panel.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    });
  }
});
