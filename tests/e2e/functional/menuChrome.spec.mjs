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

  for (const mode of ["light", "dark"]) {
    test(`slash menu keeps the overlay chrome in ${mode}`, async ({ page, baseURL }) => {
      await page.addInitScript((value) => localStorage.setItem("osionos:theme-mode", value), mode);
      await openFreshPage(page, baseURL);
      await typeInFreshEditor(page, "/");
      await expect(slashMenu(page)).toBeVisible();
      expect(await readChrome(slashMenu(page))).toEqual(await referenceChrome(page));
    });
  }
});
