/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageProperties.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 15:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 15:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A page's properties used to be native <select> and date controls, which
// ignore the palette, the radius and the theme. They now use the kit's
// Dropdown, the chip recipe and the field recipe, and these tests pin that:
// no native select, a keyboard path that persists, pill chips, and a date
// field that follows the app's theme rather than the OS's.

import { expect, test } from "@playwright/test";

import { openFreshPage, waitForRenderStability } from "../../browser/core/app.mjs";

const PROPERTIES = [
  { key: "stage", label: "Stage", type: "select", value: "", options: ["Todo", "Doing", "Done"] },
  { key: "tags", label: "Tags", type: "multi_select", value: ["alpha", "beta"], options: ["alpha", "beta", "gamma"] },
  { key: "due", label: "Due", type: "date", value: "2026-10-01" },
];

const properties = (page) => page.getByRole("group", { name: "Page properties" });

/** Gives the open page the properties above, as a page imported from a database has them. */
async function seedProperties(page) {
  await page.evaluate(async (seed) => {
    const { usePageStore } = await import("/src/store/usePageStore.ts");
    const store = usePageStore.getState();
    store.patchPage(store.activePage?.id, { properties: seed });
  }, PROPERTIES);
  await waitForRenderStability(page);
}

async function openWithProperties(page, baseURL) {
  await openFreshPage(page, baseURL);
  await seedProperties(page);
  await expect(properties(page).getByRole("combobox", { name: "Stage" })).toBeVisible();
}

const computed = (locator, property) =>
  locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);

test.describe("page properties", () => {
  test("no property is edited through a native select", async ({ page, baseURL }) => {
    await openWithProperties(page, baseURL);
    await expect(page.locator("select")).toHaveCount(0);
    await expect(page.locator(".osionos-page-properties select")).toHaveCount(0);
    await expect(properties(page).locator("select")).toHaveCount(0);
  });

  test("a select property is chosen from the keyboard, and the choice survives a reload", async ({ page, baseURL }) => {
    await openWithProperties(page, baseURL);
    const stage = properties(page).getByRole("combobox", { name: "Stage" });
    await stage.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(stage).toHaveText("Doing");
    await expect(stage).toBeFocused();

    await page.evaluate(async () => {
      const { flushScheduledPagesCachePersist } = await import("/src/store/pageStore.helpers.ts");
      flushScheduledPagesCachePersist();
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(properties(page).getByRole("combobox", { name: "Stage" })).toHaveText("Doing");
  });

  test("Escape closes the list and leaves the value as it was", async ({ page, baseURL }) => {
    await openWithProperties(page, baseURL);
    const stage = properties(page).getByRole("combobox", { name: "Stage" });
    await stage.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(stage).not.toHaveText("Todo");
  });

  test("multi-select values are pill chips, and removing one keeps the rest", async ({ page, baseURL }) => {
    await openWithProperties(page, baseURL);
    const chips = properties(page).locator(".osio-chip");
    await expect(chips).toHaveText(["alpha", "beta"]);
    expect(await computed(chips.first(), "border-top-left-radius")).toBe("9999px");
    await properties(page).getByRole("button", { name: "Remove alpha" }).click();
    await expect(chips).toHaveText(["beta"]);
  });

  test("a multi-select option is added from the dropdown", async ({ page, baseURL }) => {
    await openWithProperties(page, baseURL);
    const add = properties(page).getByRole("combobox", { name: "Add to Tags" });
    await add.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("option")).toHaveText(["gamma"]);
    await page.keyboard.press("Enter");
    await expect(properties(page).locator(".osio-chip")).toHaveText(["alpha", "beta", "gamma"]);
  });

  test("a chosen select value is a pill chip", async ({ page, baseURL }) => {
    await openWithProperties(page, baseURL);
    const stage = properties(page).getByRole("combobox", { name: "Stage" });
    await stage.click();
    await page.getByRole("option", { name: "Doing" }).click();
    await expect(stage).toHaveText("Doing");
    expect(await computed(stage, "border-top-left-radius")).toBe("9999px");
    expect(await computed(stage, "height")).toBe("22px");
  });

  test("on a phone the open lists stay attached to their triggers", async ({ page, baseURL }) => {
    await openWithProperties(page, baseURL);
    // Resized after the page exists: the phone layout opens on Home, not on the new page.
    await page.setViewportSize({ width: 390, height: 844 });
    for (const name of ["Stage", "Add to Tags"]) {
      const trigger = properties(page).getByRole("combobox", { name });
      await trigger.focus();
      await page.keyboard.press("Enter");
      const list = page.getByRole("listbox");
      await expect(list).toBeVisible();
      await expect.poll(async () => (await list.boundingBox()).x).toBeGreaterThan(0);
      const [listBox, triggerBox] = [await list.boundingBox(), await trigger.boundingBox()];
      expect(Math.abs(listBox.x - triggerBox.x)).toBeLessThanOrEqual(2);
      expect(listBox.x + listBox.width).toBeLessThanOrEqual(390);
      await page.keyboard.press("Escape");
      await expect(list).toHaveCount(0);
    }
  });

  for (const mode of ["light", "dark"]) {
    test(`the date field is a field recipe and follows the ${mode} theme`, async ({ page, baseURL }) => {
      await page.addInitScript((stored) => localStorage.setItem("osionos:theme-mode", stored), mode);
      await page.emulateMedia({ colorScheme: mode === "light" ? "dark" : "light" });
      await openWithProperties(page, baseURL);
      const due = properties(page).getByLabel("Due", { exact: true });
      await expect(due).toHaveAttribute("type", "date");
      await expect(due).toHaveClass(/osio-field/);
      expect(await computed(due, "color-scheme")).toBe(mode);
      expect(await computed(due, "border-top-left-radius")).toBe("8px");
      expect(await computed(due, "height")).toBe("32px");
    });
  }
});

test.describe("page configuration menu", () => {
  test("its language dropdown picks a language without closing the menu", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await page.getByRole("button", { name: "Open page configuration" }).click();
    const language = page.getByRole("combobox", { name: "Translation language" });
    await expect(page.locator("select")).toHaveCount(0);
    const before = await language.innerText();
    await language.click();
    const options = page.getByRole("option");
    const target = options.filter({ hasNotText: before }).first();
    const chosen = (await target.innerText()).split("\n")[0];
    await target.click();
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(language).toBeVisible();
    await expect(language).toHaveText(chosen);
  });
  test("Escape closes only the language list and keeps focus on its combobox", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await page.getByRole("button", { name: "Open page configuration" }).click();
    const language = page.getByRole("combobox", { name: "Translation language" });
    await language.click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(language).toBeVisible();
    await expect(language).toBeFocused();
  });
});
