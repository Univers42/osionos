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
  ["font-size", "--text-2xs", "--osio-font-size-2xs"],
  ["font-size", "--text-3xs", "--osio-font-size-3xs"],
  ["font-size", "--text-display", "--osio-font-size-display"],
];

const styleOf = (locator, ...properties) =>
  locator.evaluate(
    (element, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(element)[name]])),
    properties,
  );

/** First family of the computed stack, unquoted: what the browser asked for first. */
const firstFamily = async (locator) => {
  const { fontFamily } = await styleOf(locator, "fontFamily");
  return fontFamily.split(",")[0].replaceAll('"', "").trim();
};

/** The look of a heading with the two length-valued parts made relative to its
 *  own size. The raw-mode preview sits outside the page's reading scale, so the
 *  two twins are legitimately 24px and 30px; what must match is the style. */
async function headingLook(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const size = Number.parseFloat(style.fontSize);
    return {
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      lineHeight: Number.parseFloat(style.lineHeight) / size,
      letterSpacing: Number.parseFloat(style.letterSpacing) / size,
    };
  });
}

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

  test("the page title is a Newsreader display line: 40px, weight 600, tight tracking", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const title = page.getByRole("textbox", { name: "Page title" });
    expect(await firstFamily(title)).toBe("Newsreader");
    const look = await styleOf(title, "fontSize", "fontWeight", "letterSpacing");
    expect(look.fontSize).toBe("40px");
    expect(look.fontWeight).toBe("600");
    expect(look.letterSpacing).toBe("-0.8px");
  });

  test("loading Newsreader does not move the title: its height is the same before and after fonts are ready", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const title = page.getByRole("textbox", { name: "Page title" });
    await page.evaluate(() => document.fonts.ready);
    const fallbackDeclared = await page.evaluate(() =>
      [...document.fonts].some((face) => face.family.replaceAll('"', "") === "Newsreader Fallback"),
    );
    expect(fallbackDeclared).toBe(true);
    const heightWithFont = (await title.boundingBox()).height;
    // The Fallback is what paints until the woff2 arrives; ask for it directly.
    const heightWithFallback = await title.evaluate((element) => {
      const before = element.style.fontFamily;
      element.style.fontFamily = '"Newsreader Fallback"';
      const height = element.getBoundingClientRect().height;
      element.style.fontFamily = before;
      return height;
    });
    expect(Math.abs(heightWithFont - heightWithFallback)).toBeLessThanOrEqual(1);
  });

  test("an editable heading is set in the heading family, not the body one", async ({ page, baseURL }) => {
    const { heading, paragraph } = await typeHeadingThenParagraph(page, baseURL);
    expect(await firstFamily(heading)).toBe("Newsreader");
    expect(await firstFamily(paragraph)).toBe("Inter Variable");
  });

  test("the page body is set in Inter, from the UI font token", async ({ page, baseURL }) => {
    const { paragraph } = await typeHeadingThenParagraph(page, baseURL);
    expect(await firstFamily(paragraph)).toBe("Inter Variable");
    expect(await firstFamily(page.locator(".osionos-page").first())).toBe("Inter Variable");
  });

  test("the serif and mono page fonts come from the tokens", async ({ page, baseURL }) => {
    const { paragraph } = await typeHeadingThenParagraph(page, baseURL);
    await page.getByRole("button", { name: "Open page configuration" }).click();
    await page.getByRole("button", { name: /^Ag\s*Serif$/ }).click();
    expect(await firstFamily(paragraph)).toBe("Newsreader");
    await page.getByRole("button", { name: /^Ag\s*Mono$/ }).click();
    expect(await firstFamily(paragraph)).toBe("JetBrains Mono");
    await page.getByRole("button", { name: /^Ag\s*Default$/ }).click();
    expect(await firstFamily(paragraph)).toBe("Inter Variable");
  });

  test("an editable heading and its read-only twin look identical", async ({ page, baseURL }) => {
    const { heading } = await typeHeadingThenParagraph(page, baseURL);
    const editable = await headingLook(heading);
    await page.getByRole("button", { name: "Open page configuration" }).click();
    await page.getByRole("button", { name: "Raw / code mode" }).click();
    const readOnly = page.locator('[data-raw-mode] h1[data-block-type="heading_1"]').first();
    await readOnly.waitFor();
    expect(await headingLook(readOnly)).toEqual(editable);
  });

  test("text-2xs, text-3xs and text-display resolve to the type tokens", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    for (const [utility, token] of [
      ["text-2xs", "--osio-font-size-2xs"],
      ["text-3xs", "--osio-font-size-3xs"],
      ["text-display", "--osio-font-size-display"],
    ]) {
      const used = await page.evaluate((className) => {
        const probe = document.createElement("div");
        probe.className = className;
        document.body.appendChild(probe);
        const size = getComputedStyle(probe).fontSize;
        probe.remove();
        return size;
      }, utility);
      expect(used, utility).toBe(await resolved(page, "font-size", `var(${token})`));
    }
    expect(await resolved(page, "font-size", "var(--osio-font-size-2xs)")).toBe("11px");
    expect(await resolved(page, "font-size", "var(--osio-font-size-3xs)")).toBe("10px");
  });

  test("sidebar section labels are sentence case, one style", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const recents = page.getByRole("button", { name: "Recents", exact: true }).locator("span").first();
    const look = await styleOf(recents, "textTransform", "letterSpacing", "fontWeight", "fontSize");
    expect(look).toEqual({ textTransform: "none", letterSpacing: "normal", fontWeight: "500", fontSize: "12px" });
  });
});
