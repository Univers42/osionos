// The workbench dock in the Calm canvas: the dock floats as a rounded card under
// the panes, the splitter is the gap between them, the status bar sits on the
// canvas, and the dock chrome reads the code tokens. Offline build: the sandbox
// is unreachable, so the terminal shows its offline state over a live xterm.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

// A custom property resolves only where it is read (the code tokens live on the
// dock, the gap and radius on the shell, which zen and compact density
// override): measure it through a probe appended inside `locator`. An undefined
// token is an error, not a zero.
function tokenAt(locator, cssProperty, token) {
  return locator.evaluate((el, [property, name]) => {
    if (getComputedStyle(el).getPropertyValue(name).trim() === "") throw new Error(`${name} is not defined here`);
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute;visibility:hidden;${property}:var(${name})`;
    el.append(probe);
    const camel = property.replace(/-./g, (m) => m[1].toUpperCase());
    const value = getComputedStyle(probe)[camel];
    probe.remove();
    return value;
  }, [cssProperty, token]);
}

const dockOf = (page) => page.getByTestId("workbench-dock");
const shellOf = (page) => page.getByTestId("app-shell");
const style = (locator, property) => locator.evaluate((el, p) => getComputedStyle(el)[p], property);
const rect = (locator) => locator.evaluate((el) => el.getBoundingClientRect().toJSON());

async function openDock(page, baseURL) {
  await openFreshPage(page, baseURL);
  await page.keyboard.press("Control+j");
  await dockOf(page).waitFor();
}

// Pseudo-elements are not matched by `*`: the splitter's hairline needs its own selector.
const NO_TRANSITIONS = "*,*::before,*::after{transition:none!important}";

const frameGap = async (page) => parseFloat(await tokenAt(shellOf(page), "width", "--osio-frame-gap"));

test.describe("dock card", () => {
  test("the dock is a rounded card aligned with the pane cards", async ({ page, baseURL }) => {
    await openDock(page, baseURL);
    const dock = dockOf(page);
    const gap = await frameGap(page);
    expect(gap).toBeGreaterThan(0);
    const radius = await tokenAt(shellOf(page), "border-top-left-radius", "--osio-radius-pane");
    expect(radius).toBe("12px");
    expect(await style(dock, "borderTopLeftRadius")).toBe(radius);
    expect(await style(dock, "borderBottomRightRadius")).toBe(radius);
    expect(await style(dock, "overflow")).toBe("hidden");
    expect(await style(dock, "borderTopWidth")).toBe("1px");
    const card = await rect(page.locator("[data-osio-pane]").last());
    const box = await rect(dock);
    expect(Math.abs(box.left - card.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.right - card.right)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.top - card.bottom - gap)).toBeLessThanOrEqual(1);
    const bar = await rect(page.getByTestId("workbench-statusbar"));
    expect(Math.abs(bar.top - box.bottom - gap)).toBeLessThanOrEqual(1);
    expect(await style(dock, "boxShadow")).toBe(await style(page.locator("[data-osio-pane]").last(), "boxShadow"));
  });

  test("compact density runs the dock edge to edge", async ({ page, baseURL }) => {
    await openDock(page, baseURL);
    await page.evaluate(() => { document.documentElement.dataset.density = "compact"; });
    const dock = dockOf(page);
    await expect.poll(() => style(dock, "borderTopLeftRadius")).toBe("0px");
    expect(await style(dock, "borderTopWidth")).toBe("0px");
    expect(await style(dock, "boxShadow")).toBe("none");
    const card = await rect(page.locator("[data-osio-pane]").last());
    const box = await rect(dock);
    expect(Math.abs(box.top - card.bottom)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.left - card.left)).toBeLessThanOrEqual(1);
  });

  test("a phone width runs the dock edge to edge", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // No "New page" affordance at this width; the workbench itself is what is under test.
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await page.locator("[data-osio-workbench]").waitFor({ state: "visible", timeout: 60_000 });
    await page.keyboard.press("Control+j");
    await dockOf(page).waitFor();
    expect(await style(dockOf(page), "borderTopLeftRadius")).toBe("0px");
    expect(await style(dockOf(page), "boxShadow")).toBe("none");
    expect(await frameGap(page)).toBe(0);
    const card = await rect(dockOf(page));
    const hide = await rect(dockOf(page).getByRole("button", { name: "Hide panel" }));
    expect(hide.right).toBeLessThanOrEqual(card.right);
    expect(hide.left).toBeGreaterThanOrEqual(card.left);
  });

  test("zen runs the dock edge to edge", async ({ page, baseURL }) => {
    await openDock(page, baseURL);
    await page.getByRole("textbox", { name: "Page title" }).first().click();
    await page.keyboard.press("Control+k");
    await page.keyboard.press("Control+z");
    await expect(page.locator('[data-zen="1"]')).toHaveCount(1);
    expect(await style(dockOf(page), "borderTopLeftRadius")).toBe("0px");
    expect(await style(dockOf(page), "borderTopWidth")).toBe("0px");
  });
});

test.describe("dock splitter", () => {
  const splitter = (page) => page.getByTestId("dock-splitter");
  const pseudo = (locator, which, property) => locator.evaluate((el, [w, p]) => getComputedStyle(el, w)[p], [which, property]);

  test("is the frame gap, transparent, with a hit area of at least 6px", async ({ page, baseURL }) => {
    await openDock(page, baseURL);
    const gap = await frameGap(page);
    const bar = splitter(page);
    expect((await rect(bar)).height).toBeCloseTo(gap, 0);
    expect(await style(bar, "backgroundColor")).toBe("rgba(0, 0, 0, 0)");
    expect(parseFloat(await pseudo(bar, "::before", "height"))).toBeGreaterThanOrEqual(6);
    expect(await pseudo(bar, "::after", "backgroundColor")).toBe("rgba(0, 0, 0, 0)");
  });

  test("shows a hairline on hover and in the accent while focused", async ({ page, baseURL }) => {
    await openDock(page, baseURL);
    await page.addStyleTag({ content: NO_TRANSITIONS });
    const bar = splitter(page);
    await bar.hover();
    expect(await pseudo(bar, "::after", "backgroundColor")).not.toBe("rgba(0, 0, 0, 0)");
    await page.mouse.move(5, 5);
    await bar.focus();
    await page.keyboard.press("ArrowUp"); // keyboard modality, so focus-visible matches
    const accent = await tokenAt(shellOf(page), "background-color", "--osio-accent");
    expect(await pseudo(bar, "::after", "backgroundColor")).toBe(accent);
    expect(await style(bar, "boxShadow")).toBe("none");
  });

  test("edge to edge it is still grabbable and drags like before", async ({ page, baseURL }) => {
    await openDock(page, baseURL);
    await page.evaluate(() => { document.documentElement.dataset.density = "compact"; });
    const bar = splitter(page);
    await expect.poll(async () => (await rect(bar)).height).toBe(0);
    expect(parseFloat(await pseudo(bar, "::before", "height"))).toBeGreaterThanOrEqual(6);
    const box = await rect(dockOf(page));
    const x = box.left + box.width / 2;
    for (const offset of [-2, 2]) {
      expect(await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.getAttribute("data-testid"), [x, box.top + offset])).toBe("dock-splitter");
    }
    const before = Number(await bar.getAttribute("aria-valuenow"));
    await page.mouse.move(x, box.top);
    await page.mouse.down();
    await page.mouse.move(x, box.top - 40, { steps: 4 });
    await page.mouse.up();
    await expect(bar).toHaveAttribute("aria-valuenow", String(before + 40));
  });
});

test.describe("dock header", () => {
  test("tabs are sentence-case pills on the code tokens, with no underline", async ({ page, baseURL }) => {
    await openDock(page, baseURL);
    const dock = dockOf(page);
    const active = dock.getByRole("tab", { name: "Terminal" });
    const idle = dock.getByRole("tab", { name: "Problems" });
    expect(await style(active, "textTransform")).toBe("none");
    expect(await style(active, "textDecorationLine")).toBe("none");
    expect(await style(active, "backgroundColor")).toBe(await tokenAt(dock, "background-color", "--osio-code-btn-active"));
    expect(await style(active, "color")).toBe(await tokenAt(dock, "color", "--osio-code-fg"));
    expect(await style(active, "borderTopLeftRadius")).toBe(await tokenAt(dock, "border-top-left-radius", "--osio-control-radius"));
    expect(await style(idle, "color")).toBe(await tokenAt(dock, "color", "--osio-code-fg-muted"));
    expect(await style(idle, "backgroundColor")).toBe("rgba(0, 0, 0, 0)");
    const header = dock.getByRole("tablist").locator("xpath=..");
    expect(await style(header, "backgroundColor")).toBe(await tokenAt(dock, "background-color", "--osio-code-header-bg"));
  });

  test("icon buttons are 24px targets with a visible focus ring", async ({ page, baseURL }) => {
    await openDock(page, baseURL);
    const dock = dockOf(page);
    for (const name of ["New terminal", "Split terminal", "Hide panel"]) {
      const button = dock.getByRole("button", { name });
      const box = await rect(button);
      expect(box.width).toBeGreaterThanOrEqual(24);
      expect(box.height).toBeGreaterThanOrEqual(24);
      expect(await style(button, "borderTopLeftRadius")).toBe(await tokenAt(dock, "border-top-left-radius", "--osio-control-radius"));
    }
    const hide = dock.getByRole("button", { name: "Hide panel" });
    await hide.hover();
    await expect.poll(() => style(hide, "backgroundColor")).toBe(await tokenAt(dock, "background-color", "--osio-code-btn-hover"));
    await page.keyboard.press("Tab");
    await hide.focus();
    expect(await style(hide, "outlineColor")).toBe(await tokenAt(shellOf(page), "color", "--osio-focus-ring-color"));
    await hide.hover();
    await expect(page.getByRole("tooltip", { name: "Hide panel" })).toBeVisible();
  });

  test("the terminal stays mounted while another tab shows", async ({ page, baseURL }) => {
    await openDock(page, baseURL);
    const dock = dockOf(page);
    await expect(dock.locator(".xterm")).toHaveCount(1);
    await dock.getByRole("tab", { name: "Output" }).click();
    await expect(dock.locator("#dock-panel-terminal")).toBeHidden();
    await expect(dock.locator(".xterm")).toHaveCount(1);
  });
});

test.describe("status bar", () => {
  test("sits on the canvas, lined up with the pane cards", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const bar = page.getByTestId("workbench-statusbar");
    expect(await style(bar, "backgroundColor")).toBe("rgba(0, 0, 0, 0)");
    expect(await style(bar, "borderTopWidth")).toBe("0px");
    expect((await rect(bar)).height).toBe(parseFloat(await tokenAt(shellOf(page), "height", "--osio-statusbar-h")));
    expect(await style(bar, "color")).toBe(await tokenAt(shellOf(page), "color", "--osio-fg-muted"));
    const card = await rect(page.locator("[data-osio-pane]").last());
    const first = await rect(bar.getByRole("button").first());
    expect(Math.abs(first.left - card.left)).toBeLessThanOrEqual(1);
  });

  test("chips take the control radius and hover fill", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await page.addStyleTag({ content: NO_TRANSITIONS });
    const chip = page.getByTestId("workbench-statusbar").getByRole("button", { name: /Panel/ });
    expect(await style(chip, "borderTopLeftRadius")).toBe(await tokenAt(shellOf(page), "border-top-left-radius", "--osio-control-radius"));
    await chip.hover();
    expect(await style(chip, "backgroundColor")).toBe(await tokenAt(shellOf(page), "background-color", "--osio-control-bg-hover"));
    expect((await rect(chip)).height).toBeGreaterThanOrEqual(20);
  });
});

test.describe("editor title bar", () => {
  test("a non-page tab keeps the page header's height, surface and text start", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const page_ = await rect(page.locator("[data-osio-editor-titlebar] > div").first());
    const crumb = await rect(page.getByRole("navigation", { name: "Page breadcrumbs" }).locator("button, span").first());
    await page.getByRole("button", { name: "Archived files" }).click();
    const plain = page.locator("[data-osio-editor-titlebar]").filter({ hasText: /rash|rchived/ }).locator("> div").first();
    await expect(plain).toBeVisible();
    const box = await rect(plain);
    expect(box.height).toBe(page_.height);
    expect(box.top).toBe(page_.top);
    const text = await rect(plain.locator("span").first());
    expect(Math.abs(text.left - crumb.left)).toBeLessThanOrEqual(1.5);
    expect(await style(plain.locator("span").first(), "fontWeight")).toBe("500");
  });
});

test.describe("terminal", () => {
  test("keeps its text off the rounded corners and fits without a horizontal scrollbar", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openDock(page, baseURL);
    const dock = dockOf(page);
    const screen = dock.locator(".xterm-screen").first();
    await screen.waitFor({ state: "attached" });
    const edge = await rect(dock);
    const text = await rect(screen);
    expect(text.left - edge.left).toBeGreaterThanOrEqual(12);
    expect(edge.bottom - text.bottom).toBeGreaterThanOrEqual(8);
    // xterm's stylesheet paints its scroll viewport #000 over the theme colour; the theme's surface must show instead.
    expect(await style(dock.locator(".xterm-viewport").first(), "backgroundColor")).toBe("rgba(0, 0, 0, 0)");
    expect(await style(dock.locator(".xterm-scrollable-element").first(), "backgroundColor")).toBe(await tokenAt(dock, "background-color", "--osio-code-bg"));
    const host = dock.locator(".xterm").first().locator("xpath=..");
    expect(await host.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const wide = (await rect(screen)).width;
    await page.setViewportSize({ width: 900, height: 800 });
    await expect.poll(async () => (await rect(screen)).width).toBeLessThan(wide);
    expect(await host.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });
});
