// The component recipes (osio-surface-overlay, osio-control, osio-field,
// osio-chip) must compute the component tokens they are built from.

import { expect, test } from "@playwright/test";

import { computed, openStyleguide, section, tokenValue } from "../support/styleguideHelpers.mjs";

// Tailwind's shadow utilities prepend four empty ring/inset layers to a box-shadow.
const withoutEmptyShadowLayers = (value) => value.replaceAll("rgba(0, 0, 0, 0) 0px 0px 0px 0px, ", "");

/** The computed value of each (property, token) pair on `locator`, next to what a probe given var(token) computes. */
async function recipeReport(page, locator, pairs) {
  const got = await locator.evaluate((element, list) => Object.fromEntries(list.map(([property]) => [property, getComputedStyle(element).getPropertyValue(property)])), pairs);
  if (got["box-shadow"]) got["box-shadow"] = withoutEmptyShadowLayers(got["box-shadow"]);
  const want = {};
  for (const [property, token] of pairs) want[property] = await tokenValue(page, property, token);
  return { got, want };
}

test.describe("styleguide recipes", () => {
  test("the overlay surface recipe computes the overlay tokens", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL);
    const sample = section(page, "Overlays").getByTestId("recipe-overlay");
    await expect(sample).toHaveClass(/osio-surface-overlay/);
    const { got, want } = await recipeReport(page, sample, [
      ["background-color", "--osio-overlay-bg"],
      ["border-top-color", "--osio-overlay-border"],
      ["border-top-left-radius", "--osio-overlay-radius"],
      ["box-shadow", "--osio-overlay-shadow"],
      ["padding-top", "--osio-overlay-padding"],
    ]);
    expect(got).toEqual(want);
    expect(got["border-top-left-radius"]).not.toBe("0px");
  });

  test("the control recipe computes its tokens, and its hover background", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL);
    const control = section(page, "Primitives").getByTestId("recipe-control");
    await expect(control).toHaveClass(/osio-control/);
    const { got, want } = await recipeReport(page, control, [
      ["height", "--osio-control-h-md"],
      ["border-top-left-radius", "--osio-control-radius"],
    ]);
    expect(got).toEqual(want);
    await control.hover();
    await expect.poll(() => computed(control, "background-color")).toBe(await tokenValue(page, "background-color", "--osio-control-bg-hover"));
  });

  test("the field recipe computes the field tokens and an accent border on focus", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL);
    const field = section(page, "Primitives").getByTestId("recipe-field");
    await expect(field).toHaveClass(/osio-field/);
    const { got, want } = await recipeReport(page, field, [
      ["height", "--osio-field-h"],
      ["background-color", "--osio-field-bg"],
      ["border-top-color", "--osio-field-border"],
      ["border-top-left-radius", "--osio-field-radius"],
    ]);
    expect(got).toEqual(want);
    await field.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(field).toBeFocused();
    await expect.poll(() => computed(field, "border-top-color")).toBe(await tokenValue(page, "color", "--osio-field-border-focus"));
  });

  test("the chip recipe is a pill with the chip tokens", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL);
    const chip = section(page, "Primitives").getByTestId("recipe-chip");
    await expect(chip).toHaveClass(/osio-chip/);
    const { got, want } = await recipeReport(page, chip, [
      ["height", "--osio-chip-h"],
      ["border-top-left-radius", "--osio-chip-radius"],
      ["padding-left", "--osio-chip-px"],
    ]);
    expect(got).toEqual(want);
    expect(got["border-top-left-radius"]).toBe("9999px");
  });

  test("the kit's menu, popover chrome and tooltip read the component tokens", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL);
    const menu = section(page, "Overlays").getByRole("menu");
    const { got, want } = await recipeReport(page, menu, [
      ["background-color", "--osio-overlay-bg"],
      ["border-top-color", "--osio-overlay-border"],
      ["border-top-left-radius", "--osio-overlay-radius"],
      ["box-shadow", "--osio-overlay-shadow"],
    ]);
    expect(got).toEqual(want);
    const save = section(page, "Primitives").getByRole("button", { name: "Save", exact: true });
    await save.hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toBeVisible();
    const bubble = await recipeReport(page, tooltip, [
      ["background-color", "--osio-tooltip-bg"],
      ["color", "--osio-tooltip-fg"],
      ["border-top-left-radius", "--osio-tooltip-radius"],
    ]);
    expect(bubble.got).toEqual(bubble.want);
  });

  // Every component token resolves to the same value as the semantic token it
  // aliases, so reading the semantic token directly would compute identically.
  // Overriding the component token with a distinct value tells them apart.
  test("the kit reads the component tokens rather than the semantic ones", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL);
    await page.evaluate(() => {
      const root = document.documentElement.style;
      root.setProperty("--osio-overlay-bg", "rgb(1, 2, 3)");
      root.setProperty("--osio-overlay-radius", "23px");
      root.setProperty("--osio-overlay-border", "rgb(4, 5, 6)");
      root.setProperty("--osio-tooltip-bg", "rgb(7, 8, 9)");
      root.setProperty("--osio-control-radius", "21px");
      root.setProperty("--osio-field-radius", "19px");
      root.setProperty("--osio-field-bg", "rgb(10, 11, 12)");
    });
    const menu = section(page, "Overlays").getByRole("menu");
    await expect(menu).toHaveCSS("background-color", "rgb(1, 2, 3)");
    await expect(menu).toHaveCSS("border-top-left-radius", "23px");
    await expect(menu).toHaveCSS("border-top-color", "rgb(4, 5, 6)");

    const save = section(page, "Primitives").getByRole("button", { name: "Save", exact: true });
    await expect(save).toHaveCSS("border-top-left-radius", "21px");
    await save.hover();
    await expect(page.getByRole("tooltip")).toHaveCSS("background-color", "rgb(7, 8, 9)");
  });

  test("the kit Dropdown list and Input read the overlay and field tokens", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL);
    await page.evaluate(() => {
      const root = document.documentElement.style;
      root.setProperty("--osio-overlay-bg", "rgb(1, 2, 3)");
      root.setProperty("--osio-overlay-padding", "11px");
      root.setProperty("--osio-field-h", "37px");
      root.setProperty("--osio-field-radius", "19px");
      root.setProperty("--osio-field-bg", "rgb(10, 11, 12)");
    });
    const trigger = page.getByRole("combobox", { name: "Sample stage" });
    await expect(trigger).toHaveCSS("height", "37px");
    await expect(trigger).toHaveCSS("border-top-left-radius", "19px");
    await trigger.focus();
    await page.keyboard.press("Enter");
    const input = section(page, "Primitives").getByPlaceholder("Type something…");
    await expect(input).toHaveCSS("border-top-left-radius", "19px");
    await expect(input).toHaveCSS("background-color", "rgb(10, 11, 12)");
    const list = page.getByRole("listbox");
    await expect(list).toBeVisible();
    await expect(list).toHaveCSS("background-color", "rgb(1, 2, 3)");
    await expect(list).toHaveCSS("padding-top", "11px");
  });
});
