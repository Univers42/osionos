// Style presets must restyle the app whatever theme is active: a theme writes its tokens inline on
// <html>, so the preset rules in surface.css are !important. Each cell compares a preset against the
// same target with the Custom look, by computed style on a real menu and the pane.

import { expect, test } from "@playwright/test";
import { activateFirstEditor, openFreshPage, slashMenu } from "../../browser/core/app.mjs";
import { clearAttrs, setAttrs } from "../support/surfaceProbes.mjs";

const AXES = ["surface", "elevation", "borders", "radius"];
const PRESETS = {
  calm: {},
  paper: { elevation: "flat", borders: "strong", radius: "sharp" },
  soft: { elevation: "deep", borders: "none", radius: "round" },
  frost: { surface: "frosted" },
  aurora: { surface: "glass", elevation: "deep", borders: "none", radius: "round" },
};
const SCALE = { sharp: 0.5, round: 1.33 };
const TRANSPARENT = "rgba(0, 0, 0, 0)";
const TARGETS = [
  { id: "default palette", attrs: {} },
  { id: "midnight palette", attrs: { palette: "midnight", theme: "dark" } },
  { id: "fjord palette", attrs: { palette: "fjord", theme: "dark" } },
  { id: "Neon Tokyo", theme: "Neon Tokyo" },
  { id: "High Contrast", theme: "High Contrast" },
  { id: "Newsprint", theme: "Newsprint" },
];

/** Applies a shipped theme the way the app does, by its compiled vars. */
const applyShipped = (page, name) =>
  page.evaluate(async (wanted) => {
    const { SHIPPED_THEMES } = await import("/src/shared/config/themes/index.ts");
    const { compileTheme } = await import("/src/shared/config/themeDoc.ts");
    const { applyCompiledTheme } = await import("/src/shared/config/themeApply.ts");
    applyCompiledTheme(compileTheme(SHIPPED_THEMES.find((theme) => theme.name === wanted)));
  }, name);

/** What the menu and the pane draw now, next to what each preset token resolves to. */
const read = (page) =>
  page.evaluate(() => {
    const resolve = (token, prop) => {
      const el = document.createElement("div");
      el.style[prop] = `var(${token})`;
      document.body.append(el);
      const value = getComputedStyle(el)[prop];
      el.remove();
      return value;
    };
    const menu = getComputedStyle(document.querySelector('[data-testid="slash-command-menu"]'));
    const pane = getComputedStyle(document.querySelector("[data-osio-pane]"));
    return {
      menuShadow: menu.boxShadow, menuBorder: menu.borderTopColor, menuRadius: parseFloat(menu.borderTopLeftRadius),
      paneShadow: pane.boxShadow, paneBorder: pane.borderTopColor, paneRadius: parseFloat(pane.borderTopLeftRadius),
      e1: resolve("--osio-e1", "boxShadow"), e4: resolve("--osio-e4", "boxShadow"), e5: resolve("--osio-e5", "boxShadow"),
      strong: resolve("--osio-border-strong", "borderColor"),
    };
  });

const setPreset = async (page, preset) => {
  await clearAttrs(page, AXES);
  await setAttrs(page, PRESETS[preset]);
};

/** The facts the preset defines, checked against the Custom reading of the same target. */
function expectPreset(preset, got, custom) {
  const p = PRESETS[preset];
  const same = (key) => expect(got[key], key).toBe(custom[key]);
  if (p.elevation === "flat") {
    expect(got.menuShadow).toBe(got.e1);
    expect(got.paneShadow).toBe("none");
  } else if (p.elevation === "deep") {
    expect(got.menuShadow).toBe(got.e5);
    expect(got.paneShadow).toContain(got.e4);
  } else if (p.surface === "frosted") {
    same("menuShadow");
    if (custom.paneShadow === "none") same("paneShadow");
    else expect(got.paneShadow).toMatch(/^(rgba\(0, 0, 0, 0\) 0px 0px 0px 0px, )*rgba\([^)]*\) 0px 1px 0px 0px inset, /);
  } else {
    same("menuShadow");
    if (p.surface !== "glass") same("paneShadow");
  }
  if (p.elevation) expect(got.menuShadow).not.toBe(custom.menuShadow);
  const edge = { none: TRANSPARENT, strong: got.strong }[p.borders];
  if (edge) {
    expect(got.menuBorder).toBe(edge);
    expect(got.paneBorder).toBe(edge);
  } else {
    same("menuBorder");
    same("paneBorder");
  }
  if (p.radius) {
    expect(custom.menuRadius).toBeGreaterThan(0);
    expect(got.menuRadius / custom.menuRadius).toBeCloseTo(SCALE[p.radius], 1);
  } else same("menuRadius");
}

test.use({ viewport: { width: 1440, height: 900 } });

test.describe("style presets across themes", () => {
  for (const target of TARGETS) {
    test(`every preset restyles ${target.id}`, async ({ page, baseURL }) => {
      await openFreshPage(page, baseURL);
      if (target.theme) await applyShipped(page, target.theme);
      else await setAttrs(page, target.attrs);
      await activateFirstEditor(page);
      await page.keyboard.type("/");
      await slashMenu(page).waitFor();
      await page.waitForTimeout(600);
      await setPreset(page, "calm");
      const custom = await read(page);
      const rows = [];
      for (const preset of Object.keys(PRESETS)) {
        await setPreset(page, preset);
        const got = await read(page);
        expectPreset(preset, got, custom);
        rows.push(`${target.id} | ${preset} | ${got.menuShadow.slice(0, 28)} | ${got.menuBorder} | ${got.paneShadow.slice(0, 28)} | ${got.menuRadius.toFixed(2)}px`);
      }
      console.log(rows.join("\n"));
    });
  }

  test("with no preset every shipped theme draws exactly the tokens it declares", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const bad = await page.evaluate(async () => {
      const { SHIPPED_THEMES } = await import("/src/shared/config/themes/index.ts");
      const { compileTheme } = await import("/src/shared/config/themeDoc.ts");
      const { applyCompiledTheme } = await import("/src/shared/config/themeApply.ts");
      const draw = (prop, value) => {
        const el = document.createElement("div");
        el.style[prop] = value;
        document.body.append(el);
        const out = getComputedStyle(el)[prop === "borderRadius" ? "borderTopLeftRadius" : prop];
        el.remove();
        return out;
      };
      const misses = [];
      for (const theme of SHIPPED_THEMES) {
        applyCompiledTheme(compileTheme(theme));
        for (const [key, value] of Object.entries(theme.layout ?? {})) {
          const prop = key === "overlay-shadow" || key === "pane-shadow" ? "boxShadow" : /^radius/.test(key) && key !== "radius-full" ? "borderRadius" : null;
          if (prop && draw(prop, `var(--osio-${key})`) !== draw(prop, value)) misses.push(`${theme.name} ${key}`);
        }
      }
      applyCompiledTheme(null);
      return misses;
    });
    expect(bad).toEqual([]);
  });
});
