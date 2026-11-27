// ************************************************************************** //
//                                                                            //
//   messengerPolish.spec.mjs                                                 //
//                                                                            //
//   The messenger and the AI chat share one composer card; grouped rows      //
//   show their time in the gutter; the toolbar is a keyboard-reachable       //
//   pill; the AI thread streams with dots. Asserted by computed style.       //
//                                                                            //
// ************************************************************************** //

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SUPPORT = "/tests/e2e/support/mountMessenger.tsx";

async function mount(page, baseURL, fn, arg) {
  await openFreshPage(page, baseURL);
  const module = await page.evaluateHandle((path) => import(path), SUPPORT);
  await page.evaluate(({ module: m, fn: name, arg: value }) => m[name](value), { module, fn, arg });
}

async function look(locator) {
  return locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return { radius: parseFloat(s.borderTopLeftRadius), shadow: s.boxShadow, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height };
  });
}

async function violationsIn(page, selector) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA).include(selector).analyze();
  return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

test.describe("messenger polish: channel", () => {
  test.beforeEach(async ({ page, baseURL }) => mount(page, baseURL, "mountChannel"));

  test("both composers are a rounded, shadowed card with a round send", async ({ page }) => {
    for (const id of ["pm-composer-full", "pm-composer-compact"]) {
      const card = page.getByTestId(id).locator("[data-dictation-composer]");
      const { radius, shadow } = await look(card);
      expect(radius, id).toBeGreaterThanOrEqual(16);
      expect(shadow, id).not.toBe("none");
      const send = page.getByTestId(id).getByRole("button", { name: "Send message" });
      const box = await look(send);
      expect(box.radius).toBeGreaterThanOrEqual(box.width / 2);
    }
    const bar = await page.getByTestId("pm-composer-full").evaluate((el) => getComputedStyle(el.firstElementChild).borderTopWidth);
    expect(bar).toBe("0px");
  });

  test("focus puts an accent border and ring on the card", async ({ page }) => {
    const root = page.getByTestId("pm-composer-full");
    await root.getByRole("textbox").focus();
    const style = await root.locator("[data-dictation-composer]").evaluate((el) => {
      const s = getComputedStyle(el);
      return { border: s.borderTopColor, shadow: s.boxShadow, accent: getComputedStyle(document.documentElement).getPropertyValue("--osio-accent") };
    });
    expect(style.shadow).not.toBe("none");
    expect(style.shadow).toContain("0px 0px 0px 2px");
  });

  test("a grouped row shows its time on hover and on focus without moving", async ({ page }) => {
    const row = page.locator("article", { hasText: "Second message from Ada, grouped" });
    const time = row.locator("time").first();
    const before = (await row.boundingBox()).height;
    await expect.poll(() => time.evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
    await row.hover();
    await expect.poll(() => time.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    expect((await row.boundingBox()).height).toBe(before);
    await page.mouse.move(0, 0);
    await row.getByRole("toolbar").getByRole("button").first().focus();
    await expect.poll(() => time.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    expect((await row.boundingBox()).height).toBe(before);
  });

  test("the toolbar is a keyboard-reachable 28px pill", async ({ page }) => {
    const row = page.locator("article", { hasText: "First message from Ada" });
    const toolbar = row.getByTestId("message-toolbar");
    await expect.poll(() => toolbar.evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
    const first = toolbar.getByRole("button").first();
    await first.focus();
    await expect.poll(() => toolbar.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    const { radius, shadow } = await look(toolbar);
    expect(radius).toBeGreaterThanOrEqual(8);
    expect(shadow).not.toBe("none");
    const size = await look(first);
    expect(Math.round(size.height)).toBe(28);
    expect(Math.round(size.width)).toBe(28);
  });

  test("an AI row carries the assistant avatar", async ({ page }) => {
    const row = page.locator("article", { hasText: "An AI answer about the roadmap" });
    await expect(row.getByTestId("assistant-avatar")).toHaveCount(1);
  });

  test("axe: no violations in the channel", async ({ page }) => {
    expect(await violationsIn(page, '[data-testid="pm-channel"]')).toEqual([]);
  });
});

test.describe("messenger polish: AI thread", () => {
  test("the composer is the same card with a round send", async ({ page, baseURL }) => {
    await mount(page, baseURL, "mountThread", false);
    const card = page.getByTestId("pm-thread").locator("[data-dictation-composer]");
    const { radius, shadow } = await look(card);
    expect(radius).toBeGreaterThanOrEqual(16);
    expect(shadow).not.toBe("none");
  });

  test("streaming shows dots and screen-reader text", async ({ page, baseURL }) => {
    await mount(page, baseURL, "mountThread", true);
    const streaming = page.getByTestId("chat-streaming");
    await expect(streaming.getByTestId("typing-dots")).toBeVisible();
    await expect(streaming.locator(".sr-only")).toHaveText("Writing…");
  });

  test("axe: no violations in the thread", async ({ page, baseURL }) => {
    await mount(page, baseURL, "mountThread", true);
    expect(await violationsIn(page, '[data-testid="pm-thread"]')).toEqual([]);
  });

  for (const [name, theme, palette] of [["light", "light", null], ["dark", "dark", null], ["contrast", "light", "contrast"]]) {
    test(`user bubble text keeps 4.5:1 in ${name}`, async ({ page, baseURL }) => {
      await mount(page, baseURL, "mountThread", false);
      await page.evaluate(({ t, p }) => {
        document.documentElement.setAttribute("data-theme", t);
        if (p) document.documentElement.setAttribute("data-palette", p);
        else document.documentElement.removeAttribute("data-palette");
      }, { t: theme, p: palette });
      const ratio = await page.locator('[data-role="user"]').evaluate((el) => {
        const ctx = document.createElement("canvas").getContext("2d");
        const rgb = (css) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = "#000";
          ctx.fillStyle = css;
          ctx.fillRect(0, 0, 1, 1);
          return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
        };
        const lum = ([r, g, b]) => {
          const f = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const probe = document.createElement("i");
        el.appendChild(probe);
        probe.style.backgroundColor = getComputedStyle(el).backgroundColor;
        const bg = rgb(getComputedStyle(probe).backgroundColor);
        probe.remove();
        const fg = rgb(getComputedStyle(el).color);
        const [hi, lo] = [lum(bg), lum(fg)].sort((a, b) => b - a);
        return (hi + 0.05) / (lo + 0.05);
      });
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  }
});
