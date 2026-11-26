// Surface styles: solid or frosted floating surfaces, elevation depth, border weight,
// and the four presets that set them together. Each is an attribute on <html>.
//
// Caveat: a screenshot-variance check proves blur is painted, not that it looks good;
// contrast is computed against the two extreme backdrops (white, black), not the real page.

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage, openPageMenuPanel, slashMenu } from "../../browser/core/app.mjs";
import { openSettings } from "../support/settingsHelpers.mjs";

const html = (page) => page.locator("html");
const setAttrs = (page, attrs) => page.evaluate((a) => Object.assign(document.documentElement.dataset, a), attrs);

/** Computed facts of one surface: blur, background alpha, shadow and box. */
const probe = (locator) =>
  locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    const alpha = (cs.backgroundColor.match(/\/\s*([\d.]+)\)|rgba\([^)]*,\s*([\d.]+)\)/) ?? [])[1] ?? (cs.backgroundColor.match(/rgba\([^)]*,\s*([\d.]+)\)/) ?? [])[1] ?? "1";
    const r = el.getBoundingClientRect();
    return { blur: cs.backdropFilter, alpha: Number(alpha), shadow: cs.boxShadow, border: cs.borderTopColor, box: [r.x, r.y, r.width, r.height].map(Math.round) };
  });

/** Opens every kind of floating surface in turn, returning label to locator. */
async function openSurfaces(page) {
  const editor = await activateFirstEditor(page);
  await page.keyboard.type("/");
  const slash = slashMenu(page);
  await slash.waitFor();
  await page.waitForTimeout(600);
  return { slash, editor };
}

test.describe("surface styles", () => {
  test("a preset card restyles once per press, arrow keys move it natively, and it survives a reload", async ({ page, baseURL }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("osionos:theme-mode", "light");
    });
    await openFreshPage(page, baseURL);
    await openSettings(page, "Preferences");
    const style = page.getByRole("group", { name: "Style" });
    await expect(style.getByRole("radio")).toHaveCount(4);
    const writes = await page.evaluate(() => {
      window.__attrWrites = 0;
      new MutationObserver((m) => (window.__attrWrites += m.length)).observe(document.documentElement, { attributes: true });
    });
    void writes;
    await style.getByRole("radio", { name: /Frost/ }).check({ force: true });
    await expect(html(page)).toHaveAttribute("data-surface", "frosted");
    expect(await page.evaluate(() => window.__attrWrites)).toBeLessThanOrEqual(2);
    await style.getByRole("radio", { name: /Frost/ }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(style.getByRole("radio", { name: /Soft/ })).toBeChecked();
    await expect(html(page)).toHaveAttribute("data-elevation", "deep");
    await expect(html(page)).not.toHaveAttribute("data-surface", "frosted");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(html(page)).toHaveAttribute("data-borders", "none");
    for (const radio of await style.getByRole("radio").all()) {
      expect(await radio.evaluate((el) => el.closest("label").querySelectorAll("*").length)).toBeGreaterThan(0);
      expect(await radio.evaluate((el) => [el.closest("label"), ...el.closest("label").querySelectorAll("*")].some((n) => getComputedStyle(n).backdropFilter !== "none"))).toBe(false);
    }
  });

  test("frosted: every floating surface is blurred and translucent, solid is neither, boxes do not move", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const { slash } = await openSurfaces(page);
    const solid = await probe(slash);
    expect(solid.blur).toBe("none");
    expect(solid.alpha).toBe(1);
    await setAttrs(page, { surface: "frosted" });
    const frosted = await probe(slash);
    expect(frosted.blur).toContain("blur(20px)");
    expect(frosted.alpha).toBeGreaterThan(0.5);
    expect(frosted.alpha).toBeLessThan(0.95);
    expect(frosted.box).toEqual(solid.box);
    await page.keyboard.press("Escape");

    await openPageMenuPanel(page, "appearance");
    for (const id of ["page-config-menu", "page-menu-appearance-panel"]) {
      const m = await probe(page.getByTestId(id));
      expect(m.blur, id).toContain("blur(20px)");
      expect(m.alpha, id).toBeLessThan(0.95);
    }
    const fixedUnderFilter = await page.evaluate(() =>
      [...document.querySelectorAll("*")].filter((el) => getComputedStyle(el).position === "fixed").filter((el) => {
        for (let p = el.parentElement; p; p = p.parentElement) if (getComputedStyle(p).backdropFilter !== "none") return true;
        return false;
      }).map((el) => el.outerHTML.slice(0, 80)));
    expect(fixedUnderFilter).toEqual([]);
  });

  test("frosted: a modal keeps its blur after the open animation ends", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page, "Teamspaces");
    await page.getByRole("region", { name: "Settings", exact: true }).getByRole("button", { name: "New teamspace", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "New teamspace" });
    await dialog.waitFor();
    await page.waitForTimeout(600);
    const bg = (await probe(dialog)).blur;
    expect(bg).toBe("none");
    await setAttrs(page, { surface: "frosted" });
    const m = await probe(dialog);
    expect(m.blur).toContain("blur(20px)");
    expect(m.alpha).toBeLessThan(0.95);
    const box = await dialog.boundingBox();
    const stripes = () =>
      page.evaluate(({ y, h }) => {
        document.getElementById("stripes")?.remove();
        const s = document.createElement("div");
        s.id = "stripes";
        s.style.cssText = `position:fixed;left:0;right:0;top:${y}px;height:${h}px;z-index:calc(var(--osio-z-modal) - 1);background:repeating-linear-gradient(90deg,#000 0 4px,#fff 4px 8px);`;
        document.body.append(s);
      }, { y: box.y, h: box.height });
    const variance = async () => {
      await stripes();
      const shot = await page.screenshot({ clip: { x: box.x + 8, y: box.y + box.height - 24, width: 64, height: 16 } });
      return page.evaluate(async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        const px = g.getImageData(0, 0, c.width, c.height).data;
        const lum = [];
        for (let i = 0; i < px.length; i += 4) lum.push(px[i]);
        const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
        return lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length;
      }, shot.toString("base64"));
    };
    const blurred = await variance();
    await page.addStyleTag({ content: "*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" });
    const sharp = await variance();
    expect(sharp).toBeGreaterThan(blurred * 2);
  });

  test("elevation: flat, default and deep change the shadow of the dialog and the menu, never their boxes", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const { slash } = await openSurfaces(page);
    const shadows = {};
    for (const depth of [undefined, "flat", "deep"]) {
      await page.evaluate((d) => (d ? (document.documentElement.dataset.elevation = d) : delete document.documentElement.dataset.elevation), depth);
      shadows[depth ?? "default"] = (await probe(slash)).shadow;
    }
    expect(new Set(Object.values(shadows)).size).toBe(3);
    const css = await page.evaluate(() => {
      const probeEl = (cls, host = document.body) => {
        const e = document.createElement("div");
        e.className = cls;
        host.append(e);
        return e;
      };
      const out = {};
      for (const depth of ["flat", "default", "deep"]) {
        if (depth === "default") delete document.documentElement.dataset.elevation;
        else document.documentElement.dataset.elevation = depth;
        const overlay = probeEl("osio-surface-overlay");
        const literal = probeEl("shadow-[var(--osio-overlay-shadow)]");
        const peek = probeEl("");
        peek.style.boxShadow = "var(--osio-menu-shadow)";
        const wrap = probeEl("");
        wrap.dataset.modalOverlay = "";
        const dlg = document.createElement("div");
        dlg.setAttribute("role", "dialog");
        wrap.append(dlg);
        out[depth] = { overlay: getComputedStyle(overlay).boxShadow, peek: getComputedStyle(peek).boxShadow, dialog: getComputedStyle(dlg).boxShadow };
        for (const e of [overlay, literal, peek, wrap]) e.remove();
      }
      return out;
    });
    expect(css.flat.dialog).not.toBe(css.deep.dialog);
    expect(css.flat.peek).not.toBe(css.deep.peek);
    expect(css.flat.overlay).not.toBe(css.deep.overlay);
    expect(css.default.peek).not.toBe("none");
  });

  test("borders: none drops the overlay border, strong thickens its colour, forced-colors keeps it", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const { slash } = await openSurfaces(page);
    const base = (await probe(slash)).border;
    await setAttrs(page, { borders: "none" });
    expect((await probe(slash)).border).toBe("rgba(0, 0, 0, 0)");
    await setAttrs(page, { borders: "strong" });
    expect((await probe(slash)).border).not.toBe(base);
    await setAttrs(page, { borders: "none" });
    await page.emulateMedia({ forcedColors: "active" });
    expect((await probe(slash)).border).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("reduced transparency and forced colors give solid frosted surfaces", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const { slash } = await openSurfaces(page);
    await setAttrs(page, { surface: "frosted" });
    expect((await probe(slash)).blur).toContain("blur");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
    const reduced = await probe(slash);
    expect(reduced.blur).toBe("none");
    expect(reduced.alpha).toBe(1);
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "no-preference" }] });
    expect((await probe(slash)).blur).toContain("blur");
    await page.emulateMedia({ forcedColors: "active" });
    const forced = await probe(slash);
    expect(forced.blur).toBe("none");
    expect(forced.alpha).toBe(1);
  });

  test("frosted is off in compact density", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const { slash } = await openSurfaces(page);
    await setAttrs(page, { surface: "frosted" });
    expect((await probe(slash)).blur).toContain("blur");
    await setAttrs(page, { density: "compact" });
    const compact = await probe(slash);
    expect(compact.blur).toBe("none");
    expect(compact.alpha).toBe(1);
    await page.evaluate(() => delete document.documentElement.dataset.density);
    expect((await probe(slash)).blur).toContain("blur");
  });

  test.describe("phone viewport", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("frosted never blurs a menu on a phone", async ({ page, baseURL }) => {
      await openFreshPage(page, baseURL);
      await setAttrs(page, { surface: "frosted" });
      const { slash } = await openSurfaces(page);
      const phone = await probe(slash);
      expect(phone.blur).toBe("none");
      expect(phone.alpha).toBe(1);
    });
  });

  test("gap 0: flat, deep and borders never reach a compact, zen, phone or resizing pane", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const pane = () =>
      page.evaluate(() => {
        const el = document.querySelector("[data-osio-pane]");
        const cs = getComputedStyle(el);
        return { shadow: cs.boxShadow, border: cs.borderTopColor, width: cs.borderTopWidth };
      });
    await setAttrs(page, { elevation: "deep", borders: "strong" });
    const desktop = await pane();
    expect(desktop.shadow).not.toBe("none");

    await setAttrs(page, { density: "compact" });
    expect((await pane()).shadow).toBe("none");
    await page.evaluate(() => delete document.documentElement.dataset.density);
    expect((await pane()).shadow).toBe(desktop.shadow);

    await page.evaluate(() => (document.documentElement.dataset.borders = "none"));
    await page.evaluate(() => (document.body.dataset.paneResizing = "1"));
    expect((await pane()).shadow).toBe("none");
    await page.evaluate(() => delete document.body.dataset.paneResizing);

    await page.setViewportSize({ width: 390, height: 844 });
    expect((await pane()).shadow).toBe("none");
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.evaluate(() => (document.documentElement.dataset.borders = "strong"));
    await page.keyboard.press("Control+k");
    await page.keyboard.press("Control+z");
    await page.waitForFunction(() => document.querySelector('[data-zen="1"]'));
    expect((await pane()).shadow).toBe("none");
  });

  for (const [mode, palette] of [["light", "warm"], ["dark", "warm"], ["light", "contrast"], ["dark", "contrast"]]) {
    test(`contrast: frosted menu text keeps 4.5:1 over white and black backdrops (${mode}, ${palette})`, async ({ page, baseURL }) => {
      await openFreshPage(page, baseURL);
      const { slash } = await openSurfaces(page);
      await setAttrs(page, { theme: mode, palette, surface: "frosted" });
      const worst = await slash.evaluate((el) => {
        const parse = (s) => {
          const n = (s.match(/-?[\d.]+/g) ?? []).map(Number);
          const rgb = s.startsWith("color(") ? n.slice(0, 3).map((v) => v * 255) : n.slice(0, 3);
          return { rgb, a: s.startsWith("color(") ? (n[3] ?? 1) : (n[3] ?? 1) };
        };
        const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        const bg = parse(getComputedStyle(el).backgroundColor);
        const text = parse(getComputedStyle(el.querySelector("[role=option], button, span") ?? el).color).rgb;
        return [255, 0].map((back) => {
          const over = bg.rgb.map((c) => c * bg.a + back * (1 - bg.a));
          const [hi, lo] = [lum(over), lum(text)].sort((x, y) => y - x);
          return (hi + 0.05) / (lo + 0.05);
        }).reduce((a, b) => Math.min(a, b));
      });
      expect(worst).toBeGreaterThanOrEqual(4.5);
    });
  }

  test("axe: frosted has no colour-contrast violation, and its only new incompletes are the translucent-overlap kind", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const { slash } = await openSurfaces(page);
    const count = async () => {
      const r = await new AxeBuilder({ page }).include('[data-testid="slash-command-menu"]').withRules(["color-contrast"]).analyze();
      const why = r.incomplete.flatMap((i) => i.nodes.map((n) => n.any.map((a) => a.data?.messageKey ?? a.message).join()));
      return { violations: r.violations.length, incomplete: why.length, why };
    };
    const solid = await count();
    await setAttrs(page, { surface: "frosted" });
    await expect(slash).toBeVisible();
    const frosted = await count();
    expect(frosted.violations).toBe(0);
    expect(frosted.why.filter((w) => w !== "elmPartiallyObscured")).toEqual([]);
    expect(frosted.incomplete).toBeGreaterThanOrEqual(solid.incomplete);
  });
});
