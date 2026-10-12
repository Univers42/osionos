/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   typeScale.spec.mjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/12 22:10:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/12 22:10:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The size tokens must be what actually renders. Both breaks were measured on
// the live app:
//  - the UI size sat on <html>, so 1rem was 14px and every rem shrank to 87.5%;
//  - the vendored database stylesheet ships a stock Tailwind theme that loads
//    later and overrode the app's mapping (--text-sm: 13px at first paint,
//    12.25px once the database chunk arrived).
// Every test below inserts a database or opens a page first, so the vendored
// stylesheet is loaded before anything is measured.

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage } from "../../browser/core/app.mjs";
import { insertInlineDatabase } from "../support/databaseHelpers.mjs";

/** Computed `property` of a throwaway element declaring `property: value`,
 *  mounted under `parentSelector` so it inherits that subtree's variables. */
async function resolved(page, property, value, parentSelector = "body") {
  return page.evaluate(
    ({ property, value, parentSelector }) => {
      const probe = document.createElement("div");
      probe.style.position = "absolute";
      probe.style.setProperty(property, value);
      document.querySelector(parentSelector).appendChild(probe);
      const result = getComputedStyle(probe).getPropertyValue(property);
      probe.remove();
      return result;
    },
    { property, value, parentSelector },
  );
}

const fontSizeOf = (locator) =>
  locator.evaluate((element) => getComputedStyle(element).fontSize);

/** [css property that consumes it, Tailwind theme key, design token]. */
const THEME_KEYS = [
  ["font-size", "--text-xs", "--osio-font-size-xs"],
  ["font-size", "--text-sm", "--osio-font-size-sm"],
  ["font-size", "--text-base", "--osio-font-size-base"],
  ["font-size", "--text-lg", "--osio-font-size-lg"],
  ["font-size", "--text-xl", "--osio-font-size-xl"],
  ["font-size", "--text-2xl", "--osio-font-size-2xl"],
  ["width", "--spacing", "--osio-space-1"],
  ["width", "--radius-sm", "--osio-radius-sm"],
  ["width", "--radius-md", "--osio-radius"],
  ["width", "--radius-lg", "--osio-radius-lg"],
  ["font-family", "--font-sans", "--osio-font-family-sans"],
  ["font-family", "--font-mono", "--osio-font-family-mono"],
];

async function typeHeadingThenParagraph(page, baseURL) {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type("# Reading scale");
  await page.keyboard.press("Enter");
  await page.keyboard.type("A paragraph long enough to be body text.");
  return {
    heading: page.locator('[data-block-type="heading_1"] [role="textbox"]').first(),
    paragraph: page.locator('[data-block-type="paragraph"] [role="textbox"]').first(),
  };
}

test.describe("type scale", () => {
  test("1rem is 16px: the UI size is not set on the root element", async ({ page }) => {
    await insertInlineDatabase(page);
    expect(await resolved(page, "width", "1rem")).toBe("16px");
  });

  test("theme keys resolve to the design tokens after the database stylesheet loads", async ({ page }) => {
    await insertInlineDatabase(page);
    const themed = {};
    const tokens = {};
    for (const [property, themeKey, token] of THEME_KEYS) {
      themed[themeKey] = await resolved(page, property, `var(${themeKey})`);
      tokens[themeKey] = await resolved(page, property, `var(${token})`);
    }
    expect(themed).toEqual(tokens);
    expect(themed["--spacing"]).toBe("4px");
  });

  test("a document reads at 16px under a 30px heading", async ({ page, baseURL }) => {
    const { heading, paragraph } = await typeHeadingThenParagraph(page, baseURL);
    expect(await fontSizeOf(heading)).toBe("30px");
    expect(await fontSizeOf(paragraph)).toBe("16px");
  });

  test("an embedded database keeps the UI text size inside a document", async ({ page }) => {
    await insertInlineDatabase(page);
    const uiSize = await resolved(page, "font-size", "var(--osio-font-size-sm)");
    const inDatabase = await resolved(page, "font-size", "var(--text-sm)", ".osionos-database-block--inline");
    const inDocument = await resolved(page, "font-size", "var(--text-sm)", ".osionos-page-body");
    expect(inDatabase).toBe(uiSize);
    expect(Number.parseFloat(inDocument)).toBeGreaterThan(Number.parseFloat(inDatabase));
  });

  test("Small text turns the reading scale off", async ({ page, baseURL }) => {
    const { paragraph } = await typeHeadingThenParagraph(page, baseURL);
    await page.getByRole("button", { name: "Open page configuration" }).click();
    await page.getByRole("button", { name: /Small text/ }).click();
    await page.locator(".osionos-page--small-text").waitFor();
    expect(await fontSizeOf(paragraph)).toBe("14px");
  });
});
