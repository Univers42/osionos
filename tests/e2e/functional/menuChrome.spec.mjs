// Every editor menu wears the one overlay chrome (corner, shadow, fill, edge)
// and its rows share one height and corner. The reference is a bare element
// carrying the osio-surface-overlay recipe, so a menu that drifts from the
// recipe fails here whatever it is built from.

import { test, expect } from "@playwright/test";

import {
  activateFirstEditor,
  createBlockViaSlash,
  createCallout,
  createParagraphs,
  getEditors,
  openBlockContextMenuForEditor,
  openFreshPage,
  selectSlashMenuEntry,
  selectText,
  slashCommandEntry,
  openSlashMenuFromEditor,
  slashMenu,
  toolbarButton,
} from "../../browser/core/app.mjs";

const CHROME_PROPERTIES = ["borderTopLeftRadius", "boxShadow", "backgroundColor", "borderTopColor"];

const readChrome = (locator) =>
  locator.evaluate((el, properties) => {
    const style = getComputedStyle(el);
    return Object.fromEntries(properties.map((name) => [name, style[name]]));
  }, CHROME_PROPERTIES);

const referenceChrome = (page) =>
  page.evaluate((properties) => {
    const probe = document.createElement("div");
    probe.className = "osio-surface-overlay";
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const chrome = Object.fromEntries(properties.map((name) => [name, style[name]]));
    probe.remove();
    return chrome;
  }, CHROME_PROPERTIES);

const resolveToken = (page, property, token) =>
  page.evaluate(([prop, name]) => {
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute;visibility:hidden;${prop}:var(${name})`;
    document.body.append(probe);
    const value = getComputedStyle(probe).getPropertyValue(prop);
    probe.remove();
    return value;
  }, [property, token]);

// Contrast of `top` painted over `base`, both any CSS colour (the fills are
// translucent colour-mix values, so they are composited on a canvas first).
const paintedContrast = (page, base, top) =>
  page.evaluate(([baseColor, topColor]) => {
    const pixel = (...colors) => {
      const ctx = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d");
      for (const color of colors) {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
      }
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const [a, b] = [pixel(baseColor), pixel(baseColor, topColor)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  }, [base, top]);

const rowMetrics = (row) =>
  row.evaluate((el) => {
    const style = getComputedStyle(el);
    return { height: style.height, radius: style.borderTopLeftRadius };
  });

async function typeInFreshEditor(page, text) {
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type(text);
  return editor;
}

const MENUS = [
  {
    name: "slash menu",
    open: async (page) => {
      await typeInFreshEditor(page, "/");
      return { panel: slashMenu(page), row: slashMenu(page).getByRole("option").first() };
    },
  },
  {
    name: "block context menu",
    open: async (page) => {
      await createParagraphs(page, ["Context target"]);
      await openBlockContextMenuForEditor(getEditors(page).first());
      const panel = page.getByTestId("block-context-menu");
      return { panel, row: panel.getByRole("menuitem").first() };
    },
  },
  {
    name: "colour menu",
    open: async (page) => {
      await typeInFreshEditor(page, "/");
      await selectSlashMenuEntry(page, "Text color");
      return { panel: page.getByTestId("color-menu") };
    },
  },
  {
    name: "turn-into menu",
    open: async (page) => {
      await createParagraphs(page, ["alpha beta"]);
      await selectText(getEditors(page).first(), "alpha");
      await toolbarButton(page, "Turn into").click();
      const panel = page.getByRole("menu");
      return { panel, row: panel.getByRole("menuitem").first() };
    },
  },
  {
    name: "page selector",
    open: async (page) => {
      await typeInFreshEditor(page, "[[Zed");
      const panel = page.getByTestId("page-selector-menu");
      return { panel, row: panel.getByRole("button").first() };
    },
  },
  {
    name: "callout type picker",
    open: async (page) => {
      await createCallout(page);
      await page.getByRole("button", { name: "Change callout type" }).click();
      const panel = page.getByRole("menu", { name: "Callout type" });
      return { panel, row: panel.getByRole("menuitemradio").first() };
    },
  },
  {
    name: "table row menu",
    open: async (page) => {
      await createBlockViaSlash(page, "table", "Table");
      await page.getByRole("button", { name: /Row 1 options/ }).focus();
      await page.keyboard.press("Enter");
      const panel = page.getByRole("menu", { name: "Table row and column actions" });
      return { panel, row: panel.getByRole("menuitem").first() };
    },
  },
];

test.describe("editor menu chrome", () => {
  for (const { name, open } of MENUS) {
    test(`${name} wears the overlay chrome`, async ({ page, baseURL }) => {
      await openFreshPage(page, baseURL);
      const { panel, row } = await open(page);
      await expect(panel).toBeVisible();
      expect(await readChrome(panel)).toEqual(await referenceChrome(page));
      if (!row) return;
      const metrics = await rowMetrics(row);
      expect(metrics.height).toBe(await resolveToken(page, "height", "--osio-control-h-sm"));
      expect(metrics.radius).toBe(await resolveToken(page, "border-top-left-radius", "--osio-radius-sm"));
    });
  }

  test("layout templates menu keeps every row on one line", async ({ page, baseURL }) => {
    await page.addInitScript(() => localStorage.setItem("osio.canvas.v2", "1"));
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await openSlashMenuFromEditor(editor, "/layout");
    const entry = slashCommandEntry(page, "Layout inline").last();
    await entry.waitFor();
    await entry.evaluate((node) => node.click());
    await page.locator(".osionos-layout-toolbar").getByRole("button", { name: /Templates/i }).click();
    const panel = page.getByRole("menu", { name: "Layout templates" });
    await expect(panel).toBeVisible();
    expect(await readChrome(panel)).toEqual(await referenceChrome(page));
    const rows = panel.getByRole("menuitem");
    for (let index = 0; index < (await rows.count()); index += 1) {
      const fits = await rows.nth(index).evaluate((el) => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth);
      expect(fits, `template row ${index} overflows`).toBe(true);
    }
  });

  // A cut through a row reads as a rendering glitch: each row of a scroll region
  // is either whole inside it or wholly scrolled out of sight.
  const rowsOutsideOrInside = (region, rowSelector) =>
    region.evaluate((el, selector) => {
      const box = el.getBoundingClientRect();
      const cut = [...el.querySelectorAll(selector)]
        .filter((row) => {
          const { top, bottom } = row.getBoundingClientRect();
          const whole = top >= box.top - 0.5 && bottom <= box.bottom + 0.5;
          const gone = top >= box.bottom - 0.5 || bottom <= box.top + 0.5;
          return !whole && !gone;
        })
        .map((row) => row.textContent.trim());
      return { cut, overflows: el.scrollHeight > el.clientHeight };
    }, rowSelector);

  test("the block menu never cuts a row in half", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshPage(page, baseURL);
    await createParagraphs(page, ["Context target"]);
    await openBlockContextMenuForEditor(getEditors(page).first());
    const region = page.getByTestId("block-context-menu").getByRole("menu");
    await expect(region).toBeVisible();
    const { cut, overflows } = await rowsOutsideOrInside(region, ':scope > div > [role="menuitem"]');
    expect(overflows, "the menu has to scroll for this test to mean anything").toBe(true);
    expect(cut).toEqual([]);
  });

  for (const [width, height] of [[1440, 900], [390, 844]]) {
    test(`the slash menu never cuts a row in half at ${width}x${height}`, async ({ page, baseURL }) => {
      // A phone opens on Home, whose heading is not the editor under test: open the page wide, then narrow.
      await page.setViewportSize({ width: 1440, height: 900 });
      await openFreshPage(page, baseURL);
      await page.setViewportSize({ width, height });
      await typeInFreshEditor(page, "/");
      const list = slashMenu(page).getByRole("listbox");
      await expect(list).toBeVisible();
      const { cut, overflows } = await rowsOutsideOrInside(list, '[role="option"]');
      expect(overflows, "the list has to scroll for this test to mean anything").toBe(true);
      expect(cut).toEqual([]);
    });
  }

  // The browser draws a frame around its own colour swatch; an osio-field border
  // on the input drew a second one around it. Save is the kit's primary button.
  test("the colour profile panel has bare swatch inputs and a kit Save button", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshPage(page, baseURL);
    await createParagraphs(page, ["Context target"]);
    await openBlockContextMenuForEditor(getEditors(page).first());
    await page.getByTestId("block-context-menu").getByRole("menuitem", { name: /Create color profile/ }).hover();
    const panel = page.getByRole("complementary", { name: "Color profile properties" });
    await expect(panel).toBeVisible();
    for (const input of await panel.locator('input[type="color"]').all()) {
      expect(await input.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("0px");
    }
    const save = panel.getByRole("button", { name: /Save profile/ });
    expect(await save.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(await resolveToken(page, "background-color", "--osio-accent"));
    expect(await save.evaluate((el) => getComputedStyle(el).height)).toBe(await resolveToken(page, "height", "--osio-control-h-sm"));
  });

  test("the colour menu's section label is a sentence-case menu label", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await typeInFreshEditor(page, "/");
    await selectSlashMenuEntry(page, "Text color");
    const label = page.getByTestId("color-menu").getByText("Color", { exact: true }).first();
    await expect(label).toBeVisible();
    const style = await label.evaluate((el) => {
      const css = getComputedStyle(el);
      return { transform: css.textTransform, weight: css.fontWeight, size: css.fontSize, spacing: css.letterSpacing, color: css.color };
    });
    expect(style.transform).toBe("none");
    expect(style.weight).toBe("500");
    expect(style.spacing).toBe("normal");
    expect(style.size).toBe(await resolveToken(page, "font-size", "--osio-font-size-xs"));
    expect(style.color).toBe(await resolveToken(page, "color", "--osio-fg-muted"));
  });

  for (const mode of ["light", "dark"]) {
    test(`slash menu keeps the overlay chrome in ${mode}`, async ({ page, baseURL }) => {
      await page.addInitScript((value) => localStorage.setItem("osionos:theme-mode", value), mode);
      await openFreshPage(page, baseURL);
      await typeInFreshEditor(page, "/");
      await expect(slashMenu(page)).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
      expect(await readChrome(slashMenu(page))).toEqual(await referenceChrome(page));
    });

    // A hover fill or hairline that vanishes into the panel leaves a menu
    // without a visible pointer or section edge; dark palettes were the weak spot.
    test(`context menu rows and separators stay visible in ${mode}`, async ({ page, baseURL }) => {
      await page.addInitScript((value) => localStorage.setItem("osionos:theme-mode", value), mode);
      await openFreshPage(page, baseURL);
      await createParagraphs(page, ["Context target"]);
      await openBlockContextMenuForEditor(getEditors(page).first());
      const panel = page.getByTestId("block-context-menu");
      const panelFill = (await readChrome(panel)).backgroundColor;
      const row = panel.getByRole("menuitem").nth(1);
      await row.hover();
      // The fill fades in over --osio-dur-fast; reading it mid-transition measures a half-painted row.
      await expect
        .poll(async () => paintedContrast(page, panelFill, await row.evaluate((el) => getComputedStyle(el).backgroundColor)))
        .toBeGreaterThan(1.15);
      const edge = await panel.locator(".osio-menu-separator").first().evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(await paintedContrast(page, panelFill, edge)).toBeGreaterThan(1.15);
    });
  }
});
