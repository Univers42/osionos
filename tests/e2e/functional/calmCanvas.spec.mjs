// The Calm canvas shell: the sidebar panel and every pane are rounded cards that
// float on a tinted canvas, separated by --osio-frame-gap. Zen, compact density
// and phone widths collapse the gap and the radius to zero (edge-to-edge).

import { test, expect } from "@playwright/test";
import { activateFirstEditor, openFreshPage } from "../../browser/core/app.mjs";

const pane = (page) => page.locator("[data-osio-pane]");

// A custom property resolves only where it is read: measure it through a probe
// inside the shell (where zen scopes its overrides) so calc() and var() chains
// come back as used values. An undefined token is an error, not a zero.
async function resolved(page, cssProperty, token) {
  return page.evaluate(([property, name]) => {
    const shell = document.querySelector('[data-testid="app-shell"]');
    if (getComputedStyle(shell).getPropertyValue(name).trim() === "") throw new Error(`${name} is not defined`);
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute;visibility:hidden;${property}:var(${name})`;
    shell.append(probe);
    const kebab = property.replace(/-./g, (m) => m[1].toUpperCase());
    const value = getComputedStyle(probe)[kebab];
    probe.remove();
    return value;
  }, [cssProperty, token]);
}

const frameGap = async (page) => parseFloat(await resolved(page, "width", "--osio-frame-gap"));
const paneRadius = (page) => resolved(page, "border-top-left-radius", "--osio-radius-pane");
const style = (locator, property) => locator.evaluate((el, p) => getComputedStyle(el)[p], property);

async function splitRight(page) {
  await page.locator('button[title="Split right"]').first().click();
  await expect(pane(page)).toHaveCount(2);
}

test.describe("calm canvas shell", () => {
  test("the shell is the canvas and a pane is a surface card", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const shell = page.getByTestId("app-shell");
    expect(await style(shell, "backgroundColor")).toBe(await resolved(page, "background-color", "--osio-bg-canvas"));
    const card = await style(pane(page).first(), "backgroundColor");
    expect(card).toBe(await resolved(page, "background-color", "--osio-bg-surface"));
    expect(card).not.toBe(await style(shell, "backgroundColor"));
  });

  test("the sidebar card and the panes are a frame gap apart", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await splitRight(page);
    const gap = await frameGap(page);
    expect(gap).toBeGreaterThan(0);
    const sidebar = await page.locator("[data-osio-sidebar-card]").boundingBox();
    const [left, right] = await pane(page).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
    expect(left.left - sidebar.x - sidebar.width).toBeGreaterThanOrEqual(gap - 0.5);
    expect(right.left - left.right).toBeGreaterThanOrEqual(gap - 0.5);
    const splitter = await page.locator("[data-pane-splitter]").boundingBox();
    expect(splitter.width).toBeGreaterThanOrEqual(4);
  });

  test("the pane root is rounded by the pane radius token", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const radius = await paneRadius(page);
    expect(radius).toBe("12px");
    expect(await style(pane(page).first(), "borderTopLeftRadius")).toBe(radius);
  });

  test("compact density sets gap and radius to zero", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await page.evaluate(() => { document.documentElement.dataset.density = "compact"; });
    expect(await frameGap(page)).toBe(0);
    expect(await style(pane(page).first(), "borderTopLeftRadius")).toBe("0px");
  });

  test("zen mode sets gap and radius to zero", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await (await activateFirstEditor(page)).click();
    await page.keyboard.press("Control+k");
    await page.keyboard.press("Control+z");
    await expect(page.locator('[data-zen="1"]')).toHaveCount(1);
    expect(await frameGap(page)).toBe(0);
    expect(await style(pane(page).first(), "borderTopLeftRadius")).toBe("0px");
  });

  test("a phone width is edge-to-edge", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFreshPage(page, baseURL);
    expect(await frameGap(page)).toBe(0);
    expect(await style(pane(page).first(), "borderTopLeftRadius")).toBe("0px");
  });

  test("only the active pane of two is outlined, and the outline follows focus", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    expect(await style(pane(page).first(), "outlineStyle")).toBe("none");
    await splitRight(page);
    const [first, second] = [pane(page).nth(0), pane(page).nth(1)];
    await expect.poll(() => style(second, "outlineStyle")).not.toBe("none");
    expect(await style(first, "outlineStyle")).toBe("none");
    expect(await style(second, "outlineOffset")).toBe("0px");
    await first.locator("[data-osio-tabstrip]").click({ position: { x: 20, y: 10 } });
    await expect.poll(() => style(first, "outlineStyle")).not.toBe("none");
    expect(await style(second, "outlineStyle")).toBe("none");
  });

  test("the active tab has no accent underline", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const tab = page.locator("[data-tab-id][data-active]").first();
    await expect(tab).toBeVisible();
    const accent = await resolved(page, "color", "--osio-accent");
    const [shadow, underline] = await Promise.all([style(tab, "boxShadow"), style(tab, "borderBottomWidth")]);
    expect(shadow).not.toContain(accent);
    expect(underline).toBe("0px");
    expect(await style(tab, "backgroundColor")).toBe(await resolved(page, "background-color", "--osio-bg-hover"));
  });
});
