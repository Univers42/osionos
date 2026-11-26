// Glass surface: a soft coloured canvas behind a see-through sidebar card, a lit top edge on
// panes, and every fallback that puts the solid look back. All by computed style.
//
// Caveat: axe cannot sample a gradient, so glass legitimately adds incompletes of the bgGradient kind
// (and the shortTextContent it brings); the blended-contrast tests below are what measure them.
// Contrast against the aurora is sampled from one screenshot rectangle behind the row,
// not every pixel the row's text crosses; the gradient is smooth, so it is the row's own backdrop
// to within a few percent, never the worst point of the whole canvas.

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { clearAttrs, composite, contrastRatio, parseColor, setAttrs } from "../support/surfaceProbes.mjs";

const SHELL = "[data-osio-shell]";
const CARD = "[data-osio-sidebar-card]";
const EDGE = /inset/;
const GRADIENT_KINDS = ["bgGradient", "shortTextContent"];

const facts = (page) =>
  page.evaluate(
    ([shell, card]) => {
      const pane = document.querySelector("[data-osio-pane]");
      const sidebar = document.querySelector(card);
      return {
        image: getComputedStyle(document.querySelector(shell)).backgroundImage,
        card: getComputedStyle(sidebar).backgroundColor,
        cardShadow: getComputedStyle(sidebar).boxShadow,
        pane: getComputedStyle(pane).backgroundColor,
        paneShadow: getComputedStyle(pane).boxShadow,
      };
    },
    [SHELL, CARD],
  );

const alphaOf = (color) => parseColor(color).a;
const reduceTransparency = (page, value) =>
  page.context().newCDPSession(page).then((cdp) => cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value }] }));

test.describe("glass surface", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
  });

  test("glass: a gradient canvas, a translucent card with opaque contents, opaque panes, a lit edge", async ({ page }) => {
    const solid = await facts(page);
    expect(solid.image).toBe("none");
    expect(alphaOf(solid.card)).toBe(1);
    expect(solid.paneShadow).not.toMatch(EDGE);
    await setAttrs(page, { surface: "glass" });
    const glass = await facts(page);
    expect(glass.image).toContain("radial-gradient");
    expect((glass.image.match(/radial-gradient/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(alphaOf(glass.card)).toBeLessThan(1);
    expect(alphaOf(glass.card)).toBeGreaterThan(0.5);
    expect(glass.pane).toBe(solid.pane);
    expect(alphaOf(glass.pane)).toBe(1);
    expect(glass.paneShadow).toMatch(EDGE);
    expect(glass.cardShadow).toMatch(EDGE);
    const noBlur = await page.locator(CARD).evaluate((el) => getComputedStyle(el).backdropFilter);
    expect(noBlur).toBe("none");
    const inner = await page.locator(CARD).evaluate((el) => {
      const probeEl = document.createElement("div");
      probeEl.style.background = "var(--osio-bg-surface)";
      el.append(probeEl);
      const own = getComputedStyle(probeEl).backgroundColor;
      probeEl.remove();
      return own;
    });
    expect(alphaOf(inner)).toBe(1);
  });

  test("glass keeps the frosted overlay blur, and the aurora is lighter in dark", async ({ page }) => {
    await setAttrs(page, { surface: "glass", theme: "light" });
    const light = (await facts(page)).image;
    await setAttrs(page, { theme: "dark" });
    const dark = (await facts(page)).image;
    expect(dark).not.toBe(light);
    const edge = (await facts(page)).paneShadow;
    expect(edge).toMatch(/0\.08\)|\/ 0\.08/);
    const blur = await page.evaluate(() => {
      const el = document.createElement("div");
      el.className = "osio-surface-overlay";
      document.body.append(el);
      const out = getComputedStyle(el).backdropFilter;
      el.remove();
      return out;
    });
    expect(blur).toContain("blur(20px)");
  });

  test("peek stays opaque in glass", async ({ page }) => {
    await setAttrs(page, { surface: "glass" });
    await page.locator("aside[data-sidebar-mode]").evaluate((el) => (el.dataset.sidebarMode = "peek"));
    expect(alphaOf((await facts(page)).card)).toBe(1);
  });

  test.describe("phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the drawer is opaque, the pane has no shadow, the aurora still paints", async ({ page }) => {
      await setAttrs(page, { surface: "glass", elevation: "deep" });
      const glass = await facts(page);
      expect(alphaOf(glass.card)).toBe(1);
      expect(glass.paneShadow).toBe("none");
      expect(glass.image).toContain("radial-gradient");
    });
  });

  test("gap 0: compact, zen, phone and resizing carry no edge and no pane shadow", async ({ page }) => {
    await setAttrs(page, { surface: "glass", elevation: "deep" });
    expect((await facts(page)).paneShadow).toMatch(EDGE);
    await setAttrs(page, { density: "compact" });
    const compact = await facts(page);
    expect([compact.paneShadow, compact.cardShadow]).toEqual(["none", "none"]);
    expect(alphaOf(compact.card)).toBe(1);
    await clearAttrs(page, ["density"]);

    await page.evaluate(() => (document.body.dataset.paneResizing = "1"));
    expect((await facts(page)).paneShadow).toBe("none");
    await page.evaluate(() => delete document.body.dataset.paneResizing);

    await page.setViewportSize({ width: 390, height: 844 });
    const phone = await facts(page);
    expect([phone.paneShadow, phone.cardShadow]).toEqual(["none", "none"]);
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.keyboard.press("Control+k");
    await page.keyboard.press("Control+z");
    await page.waitForFunction(() => document.querySelector('[data-zen="1"]'));
    expect((await facts(page)).paneShadow).toBe("none");
  });

  test("forced colors and reduced transparency put the solid card, the plain canvas and no edge back", async ({ page }) => {
    await setAttrs(page, { surface: "glass" });
    const glass = await facts(page);
    expect(glass.image).toContain("radial-gradient");
    await reduceTransparency(page, "reduce");
    const reduced = await facts(page);
    expect([reduced.image, alphaOf(reduced.card)]).toEqual(["none", 1]);
    expect(reduced.paneShadow).not.toMatch(EDGE);
    expect(reduced.cardShadow).not.toMatch(EDGE);
    await reduceTransparency(page, "no-preference");
    expect((await facts(page)).image).toContain("radial-gradient");
    await page.emulateMedia({ forcedColors: "active" });
    const forced = await facts(page);
    expect([forced.image, alphaOf(forced.card)]).toEqual(["none", 1]);
    expect(forced.paneShadow).not.toMatch(EDGE);
  });

  test("edge and depth combine: default is edge + e1, flat is the edge alone, deep is edge + e4", async ({ page }) => {
    await setAttrs(page, { surface: "glass" });
    const shadows = {};
    for (const depth of ["default", "flat", "deep"]) {
      if (depth === "default") await clearAttrs(page, ["elevation"]);
      else await setAttrs(page, { elevation: depth });
      shadows[depth] = (await facts(page)).paneShadow;
    }
    const layers = (shadow) => (shadow.match(/rgba?\((?!0, 0, 0, 0\))|color\(/g) ?? []).length;
    expect(layers(shadows.flat), JSON.stringify(shadows)).toBe(1);
    expect(shadows.flat).toMatch(EDGE);
    expect(layers(shadows.default)).toBeGreaterThan(layers(shadows.flat));
    expect(layers(shadows.deep)).toBeGreaterThan(layers(shadows.flat));
    expect(new Set(Object.values(shadows)).size).toBe(3);
    await setAttrs(page, { surface: "frosted" });
    expect((await facts(page)).paneShadow).not.toMatch(EDGE);
  });

  for (const [mode, palette] of [["light", "warm"], ["dark", "warm"], ["light", "contrast"], ["dark", "contrast"]]) {
    test(`contrast: sidebar row text over the card blended on the aurora keeps 4.5:1 (${mode}, ${palette})`, async ({ page }) => {
      await setAttrs(page, { theme: mode, palette, surface: "glass" });
      const row = page.getByRole("treeitem").first();
      await row.waitFor();
      const info = await page.evaluate(
        ([card, rowEl]) => {
          const cardEl = document.querySelector(card);
          const target = document.querySelector(rowEl) ?? cardEl;
          const r = target.getBoundingClientRect();
          return { bg: getComputedStyle(cardEl).backgroundColor, text: getComputedStyle(target).color, rect: { x: r.x, y: r.y, width: Math.max(r.width, 8), height: Math.max(r.height, 8) } };
        },
        [CARD, '[role="treeitem"]'],
      );
      await page.addStyleTag({ content: `${CARD}, ${CARD} * { background: transparent !important; visibility: hidden !important; box-shadow: none !important; }` });
      const shot = await page.screenshot({ clip: info.rect });
      const pixel = await page.evaluate(async (b64) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0);
        const d = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
        const sum = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c += 1) sum[c] += d[i + c];
        return sum.map((v) => v / (d.length / 4));
      }, shot.toString("base64"));
      const under = composite(parseColor(info.bg), pixel);
      const ratio = contrastRatio(parseColor(info.text).rgb, under);
      console.log(`blended contrast ${mode}/${palette}: ${ratio.toFixed(2)}:1`);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  }

  for (const palette of ["warm", "contrast"]) {
    for (const mode of ["light", "dark"]) {
      test(`axe: glass adds no colour-contrast violation or incomplete over solid (${mode}, ${palette})`, async ({ page }) => {
        await setAttrs(page, { theme: mode, palette });
        const run = async () => {
          const r = await new AxeBuilder({ page }).include('[data-testid="app-shell"]').withRules(["color-contrast"]).analyze();
          return { violations: r.violations.flatMap((v) => v.nodes.map((n) => n.target.join(" "))), incomplete: r.incomplete.reduce((n, i) => n + i.nodes.length, 0), why: [...new Set(r.incomplete.flatMap((i) => i.nodes.flatMap((n) => n.any.map((a) => a.data?.messageKey ?? a.message))))] };
        };
        const solid = await run();
        await setAttrs(page, { surface: "glass" });
        const glass = await run();
        expect(glass.violations.filter((target) => !solid.violations.includes(target))).toEqual([]);
        expect(glass.why.filter((w) => !GRADIENT_KINDS.includes(w)), `solid ${solid.incomplete} incomplete`).toEqual(solid.why);
      });
    }
  }
});
