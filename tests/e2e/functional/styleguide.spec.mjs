// The design-system reference at /__styleguide is what a palette or a token
// change is reviewed against. It used to nest its own light and dark columns,
// so it never showed what the document's palette really produces, and it had
// no radius, elevation, motion, density or overlay samples at all.

import { expect, test } from "@playwright/test";

import { computed, openStyleguide, section, tokenValue } from "../support/styleguideHelpers.mjs";

const SECTIONS = [
  "Surfaces",
  "Text",
  "Accent",
  "Border and status",
  "Block tints",
  "Typography",
  "Radius",
  "Elevation",
  "Motion",
  "Density",
  "Overlays",
  "Primitives",
  "Callout and code",
];

const html = (page) => page.locator("html");

/** Every sample of one token family in a section must compute the CSS
 *  property it demonstrates to what a fresh element given var(token) computes. */
async function sampleReport(page, sectionName, tokenPrefix, cssProperty) {
  return section(page, sectionName).evaluate((region, [prefix, property]) => {
    const samples = [...region.querySelectorAll(`[data-token^="${prefix}"]`)];
    const mismatches = [];
    for (const sample of samples) {
      const token = sample.dataset.token;
      const probe = document.createElement("div");
      probe.style.setProperty(property, `var(${token})`);
      document.body.append(probe);
      const want = getComputedStyle(probe).getPropertyValue(property);
      probe.remove();
      const got = getComputedStyle(sample).getPropertyValue(property);
      if (!want || got !== want) mismatches.push(`${token}: ${got} != ${want}`);
    }
    return { count: samples.length, mismatches };
  }, [tokenPrefix, cssProperty]);
}

test.describe("styleguide", () => {
  test("every design-system section is on the page, once, in order", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL);
    const headings = await page.getByTestId("styleguide").getByRole("heading", { level: 2 }).allInnerTexts();
    expect(headings).toEqual(SECTIONS);
    for (const name of SECTIONS) await expect(section(page, name)).toHaveCount(1);
  });

  test("it is themed by the document, with no nested theme of its own", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL);
    await expect(page.locator("[data-theme]")).toHaveCount(1);
    await expect(page.locator("[data-palette]")).toHaveCount(1);
  });

  test("the palette control re-themes the document and the choice survives a reload", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL);
    const pageColour = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--osio-bg-page").trim());
    const before = await pageColour();
    await page.getByLabel("Palette", { exact: true }).selectOption("nord");
    await expect(html(page)).toHaveAttribute("data-palette", "nord");
    expect(await pageColour()).not.toBe(before);
    expect(await page.evaluate(() => localStorage.getItem("osionos:palette"))).toBe("nord");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByTestId("styleguide").waitFor();
    await expect(html(page)).toHaveAttribute("data-palette", "nord");
    await expect(page.getByLabel("Palette", { exact: true })).toHaveValue("nord");
  });

  test("the mode buttons switch the document between light and dark", async ({ page, baseURL }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openStyleguide(page, baseURL);
    const light = page.getByRole("button", { name: "Light", exact: true });
    const dark = page.getByRole("button", { name: "Dark", exact: true });
    await dark.click();
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    await expect(dark).toHaveAttribute("aria-pressed", "true");
    await expect(light).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => localStorage.getItem("osionos:theme-mode"))).toBe("dark");
    await light.click();
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await expect(light).toHaveAttribute("aria-pressed", "true");
  });

  test("every sample names a token that exists", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL);
    const report = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const tokens = [...document.querySelectorAll("[data-token]")].map((sample) => sample.dataset.token);
      return { count: tokens.length, missing: [...new Set(tokens)].filter((token) => root.getPropertyValue(token).trim() === "") };
    });
    expect(report.missing).toEqual([]);
    expect(report.count).toBeGreaterThanOrEqual(58);
  });

  test("colour sections show one sample per token", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL);
    await expect(section(page, "Surfaces").locator("[data-token]")).toHaveCount(7);
    await expect(section(page, "Text").locator("[data-token]")).toHaveCount(4);
    await expect(section(page, "Accent").locator("[data-token]")).toHaveCount(3);
    await expect(section(page, "Border and status").locator("[data-token]")).toHaveCount(4);
    await expect(section(page, "Block tints").locator("[data-tint]")).toHaveCount(9);
  });

  test("radius, elevation, motion and density samples render their token's real value", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL);
    const families = [
      ["Radius", "--osio-radius", "border-radius", 10],
      ["Elevation", "--osio-e", "box-shadow", 6],
      ["Motion", "--osio-dur-", "transition-duration", 4],
      ["Motion", "--osio-ease-", "transition-timing-function", 6],
      ["Density", "--osio-control-h-", "height", 4],
      ["Density", "--osio-space-", "width", 12],
    ];
    for (const [name, prefix, property, count] of families) {
      const report = await sampleReport(page, name, prefix, property);
      expect(report.mismatches, `${name} ${prefix}`).toEqual([]);
      expect(report.count, `${name} ${prefix} sample count`).toBe(count);
    }
  });

  test("overlays show the menu primitive and the overlay surface", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL);
    const overlays = section(page, "Overlays");
    await expect(overlays.getByText("Notify", { exact: true })).toBeVisible();
    await expect(overlays.getByText("Delete", { exact: true })).toBeVisible();
    const surface = overlays.getByTestId("overlay-surface");
    await expect(surface).toBeVisible();
    const style = await surface.evaluate((element) => {
      const probe = document.createElement("div");
      probe.style.borderRadius = "var(--osio-radius-overlay)";
      probe.style.boxShadow = "var(--osio-e4)";
      document.body.append(probe);
      const want = { radius: getComputedStyle(probe).borderRadius, shadow: getComputedStyle(probe).boxShadow };
      probe.remove();
      return { want, got: { radius: getComputedStyle(element).borderRadius, shadow: getComputedStyle(element).boxShadow } };
    });
    expect(style.got).toEqual(style.want);
  });

  test("the page never scrolls sideways on a phone", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openStyleguide(page, baseURL);
    const overflow = await page.getByTestId("styleguide").evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

/** Tab onto the tooltip's trigger: only a keyboard focus opens a tooltip at once. */
async function tabToSave(page) {
  const primitives = section(page, "Primitives");
  const save = primitives.getByRole("button", { name: "Save", exact: true });
  await primitives.getByRole("checkbox", { name: "Some selected", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(save).toBeFocused();
  return save;
}

test.describe("styleguide primitives", () => {
  test("an avatar shows initials on its owner's tint, the image when it loads, and initials again when it fails", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL);
    const primitives = section(page, "Primitives");
    const initials = primitives.getByRole("img", { name: "Ada Lovelace", exact: true });
    await expect(initials).toHaveText("AL");
    expect(await computed(initials, "background-color")).toBe(await tokenValue(page, "background-color", "--osio-block-tint-red-bg"));
    expect(await computed(initials, "color")).toBe(await tokenValue(page, "color", "--osio-block-tint-red-fg"));

    const pictured = primitives.getByRole("img", { name: "Margaret Hamilton", exact: true });
    await expect(pictured.locator("img")).toBeVisible();
    await expect(pictured).toHaveText("");

    const broken = primitives.getByRole("img", { name: "Linus Torvalds", exact: true });
    await expect(broken).toHaveText("LT");
    await expect(broken.locator("img")).toHaveCount(0);
  });

  test("key caps read the smallest radius token", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL);
    const keys = section(page, "Primitives").locator("kbd");
    await expect(keys).toHaveText(["Ctrl", "K"]);
    expect(await computed(keys.first(), "border-radius")).toBe(await tokenValue(page, "border-radius", "--osio-radius-xs"));
  });

  test("a checkbox toggles by its label and by the keyboard, and shows its focus ring", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL);
    const primitives = section(page, "Primitives");
    const subscribe = primitives.getByRole("checkbox", { name: "Subscribe", exact: true });
    const box = subscribe.locator("xpath=following-sibling::span[1]");
    await expect(subscribe).not.toBeChecked();
    await primitives.getByText("Subscribe", { exact: true }).click();
    await expect(subscribe).toBeChecked();
    const accent = await tokenValue(page, "background-color", "--osio-accent");
    await expect.poll(() => computed(box, "background-color")).toBe(accent);
    await subscribe.press("Space");
    await expect(subscribe).not.toBeChecked();
    await expect.poll(() => computed(box, "outline-width")).toBe("2px");
    expect(await computed(box, "outline-style")).toBe("solid");
  });

  test("a mixed checkbox stays mixed when its owner keeps it so, and a disabled one is disabled", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL);
    const primitives = section(page, "Primitives");
    const mixed = primitives.getByRole("checkbox", { name: "Some selected", exact: true });
    await expect(mixed).toHaveJSProperty("indeterminate", true);
    await primitives.getByText("Some selected", { exact: true }).click();
    await expect(mixed).toHaveJSProperty("indeterminate", true);
    await expect(mixed).not.toBeChecked();
    const locked = primitives.getByRole("checkbox", { name: "Locked", exact: true });
    await expect(locked).toBeDisabled();
    await expect(locked).toBeChecked();
  });

  test("a tooltip opens on keyboard focus, describes its trigger, and closes on Escape", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL);
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toHaveCount(0);
    const save = await tabToSave(page);
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText("Saves the page");
    await expect(save).toHaveAttribute("aria-describedby", await tooltip.getAttribute("id"));
    expect(await computed(tooltip, "z-index")).toBe(await tokenValue(page, "z-index", "--osio-z-toast"));
    await page.keyboard.press("Escape");
    await expect(tooltip).toHaveCount(0);
    await expect(save).not.toHaveAttribute("aria-describedby");
  });

  test("a tooltip opens centred above its trigger on hover, and a press closes it", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL);
    const save = section(page, "Primitives").getByRole("button", { name: "Save", exact: true });
    const tooltip = page.getByRole("tooltip");
    await save.hover();
    await expect(tooltip).toBeVisible();
    const bubble = await tooltip.boundingBox();
    const anchor = await save.boundingBox();
    expect(Math.abs(bubble.y + bubble.height + 6 - anchor.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(bubble.x + bubble.width / 2 - (anchor.x + anchor.width / 2))).toBeLessThanOrEqual(1);
    await page.mouse.down();
    await expect(tooltip).toHaveCount(0);
    await page.mouse.up();
  });

  test("clicking a trigger with the mouse does not leave its tooltip up", async ({ page, baseURL }) => {
    await page.clock.install();
    await openStyleguide(page, baseURL);
    await section(page, "Primitives").getByRole("button", { name: "Save", exact: true }).click();
    await page.clock.runFor(2000);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  });

  test("a tooltip follows its trigger when the page scrolls under it", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL);
    const tooltip = page.getByRole("tooltip");
    const save = await tabToSave(page);
    await expect(tooltip).toBeVisible();
    const before = await save.boundingBox();
    await page.getByTestId("styleguide").evaluate((element) => element.scrollBy(0, -48));
    await expect.poll(async () => (await save.boundingBox()).y).toBeGreaterThan(before.y + 40);
    await expect.poll(async () => {
      const bubble = await tooltip.boundingBox();
      const anchor = await save.boundingBox();
      return bubble && anchor ? Math.abs(bubble.y + bubble.height + 6 - anchor.y) : Number.NaN;
    }).toBeLessThanOrEqual(1);
  });
});
