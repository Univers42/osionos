// The settings screen uses the kit's Button and Toggle instead of private
// copies, so its controls take their look from the control tokens and its
// switches are real, named switches whose state survives closing the modal.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

async function openSettingsTab(page, tabName) {
  await page.getByRole("dialog", { name: "Settings" }).getByRole("tab", { name: tabName, exact: true }).click();
  await expect(page.getByRole("tabpanel")).toBeVisible();
}

async function openSettings(page, tabName) {
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await openSettingsTab(page, tabName);
}

async function closeSettings(page) {
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeHidden();
}

/** What a token resolves to on this page, so a test compares computed values, not names. */
function resolvedToken(page, property, token) {
  return page.evaluate(
    ([cssProperty, name]) => {
      const probe = document.createElement("div");
      probe.style.setProperty(cssProperty, `var(${name})`);
      document.body.append(probe);
      const value = getComputedStyle(probe).getPropertyValue(cssProperty);
      probe.remove();
      return value;
    },
    [property, token],
  );
}

test.describe("settings use the kit", () => {
  test("every switch is a named switch; one flips and keeps its state across reopening", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page, "Preferences");

    const switches = page.getByRole("tabpanel").getByRole("switch");
    expect(await switches.count()).toBeGreaterThan(2);
    for (const name of await switches.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")))) {
      expect(name?.trim(), "a switch needs a name that says what it changes").toBeTruthy();
      expect(name).not.toBe("Toggle setting");
    }

    const enterSwitch = page.getByRole("switch", { name: "Use Enter to add a new line" });
    const before = await enterSwitch.getAttribute("aria-checked");
    await enterSwitch.click();
    const after = before === "true" ? "false" : "true";
    await expect(enterSwitch).toHaveAttribute("aria-checked", after);

    await closeSettings(page);
    await openSettings(page, "Preferences");
    await expect(page.getByRole("switch", { name: "Use Enter to add a new line" })).toHaveAttribute("aria-checked", after);
  });

  test("a primary button is the accent colour at the kit's control height", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page, "osionos AI");

    const upgrade = page.getByRole("tabpanel").getByRole("button", { name: "Upgrade" }).first();
    await expect(upgrade).toBeVisible();
    const accent = await resolvedToken(page, "background-color", "--osio-accent");
    await expect(upgrade).toHaveCSS("background-color", accent);
    // The private Button had no fixed height; only the kit Button sizes itself from the density token.
    await expect(upgrade).toHaveCSS("height", await resolvedToken(page, "height", "--osio-control-h-md"));
  });

  test("buttons in the modal take the control radius", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const radius = await resolvedToken(page, "border-radius", "--osio-control-radius");
    expect(radius).not.toBe("");

    await openSettings(page, "Preferences");
    // The section nav only: a panel's own segmented tabs (appearance) would shift the indices.
    const tabs = page.getByRole("dialog", { name: "Settings" }).getByRole("complementary").getByRole("tab");
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThan(10);
    // A kit Card made clickable, or the import drop zone, is a panel, not a control: it is
    // styled with the panel radius token. Only those are exempt, so a Button drifting to
    // the panel radius still fails.
    const panelRadius = await resolvedToken(page, "border-radius", "--osio-radius-panel");
    // Segments of the People view switcher: one rounded group, not separate buttons.
    const segmentLabels = ["Table", "Gallery"];
    for (let index = 0; index < tabCount; index += 1) {
      const tabName = (await tabs.nth(index).textContent())?.trim();
      await tabs.nth(index).click();
      await expect(page.getByRole("tabpanel")).toBeVisible();
      // Tabs are navigation rows and switches are pills: neither is a Button. The appearance
      // controls belong to the theme panel, which is restyled on its own. The avatar and
      // workspace-icon pickers are the picture itself made clickable, shaped by what they show.
      const radii = await page
        .getByRole("dialog", { name: "Settings" })
        .locator('button:not([role="tab"]):not([role="switch"]):not([aria-label="Change avatar"]):not([aria-label="Change workspace icon"]):not([data-settings-anchor="appearance"] *)')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.getClientRects().length > 0)
            .map((node) => ({
              name: node.getAttribute("aria-label") ?? node.textContent?.trim().slice(0, 30),
              radius: getComputedStyle(node).borderRadius,
              isPanel: node.classList.contains("rounded-[var(--osio-radius-panel)]"),
            })),
        );
      expect(radii.length, `${tabName} shows buttons`).toBeGreaterThan(0);
      const offRadius = radii.filter((entry) => !segmentLabels.includes(entry.name) && entry.radius !== (entry.isPanel ? panelRadius : radius));
      expect(offRadius, `${tabName}: buttons off the control radius`).toEqual([]);
    }
  });
  test("a reversible action is outlined danger text; an irreversible one keeps the solid fill", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page, "Page settings");
    const danger = await resolvedToken(page, "background-color", "--osio-danger");
    const dangerText = await resolvedToken(page, "color", "--osio-danger");
    const move = page.getByRole("tabpanel").getByRole("button", { name: "Move", exact: true });
    await expect(move).toBeVisible();
    await expect(move).toHaveCSS("color", dangerText);
    await expect(move).not.toHaveCSS("background-color", danger);
    await expect(move).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    await openSettingsTab(page, "General");
    const remove = page.getByRole("tabpanel").getByRole("button", { name: "Delete workspace", exact: true });
    await expect(remove).toHaveCSS("background-color", danger);
  });

  test("the selected landing page is an accent outline, not a solid primary button", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page, "General");
    await page.getByRole("tabpanel").getByRole("button", { name: /Select page|Change page/ }).click();
    const choices = page.getByRole("dialog", { name: "Select landing page" }).locator("button[aria-pressed]");
    await expect(choices.first()).toBeVisible();
    await choices.first().click();
    await page.getByRole("tabpanel").getByRole("button", { name: /Select page|Change page/ }).click();
    const selected = page.getByRole("dialog", { name: "Select landing page" }).locator('button[aria-pressed="true"]');
    await expect(selected).toHaveCount(1);
    await expect(selected).not.toHaveCSS("background-color", await resolvedToken(page, "background-color", "--osio-accent"));
    await expect(selected).toHaveCSS("border-top-color", await resolvedToken(page, "border-top-color", "--osio-accent"));
  });

  test("at phone width the section nav is a strip above the panel and nothing is clipped", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshPage(page, baseURL);
    await openSettings(page, "osionos AI");
    await page.setViewportSize({ width: 390, height: 844 });

    const panel = page.getByRole("tabpanel");
    await expect.poll(async () => (await panel.boundingBox()).width).toBeGreaterThanOrEqual(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const upgrade = panel.getByRole("button", { name: "Upgrade" }).first();
    await upgrade.scrollIntoViewIfNeeded();
    await expect(upgrade).toBeInViewport({ ratio: 1 });

    const tabs = page.getByRole("dialog", { name: "Settings" }).getByRole("complementary").getByRole("tab");
    const count = await tabs.count();
    expect(count).toBeGreaterThan(10);
    const nav = await tabs.first().boundingBox();
    expect((await panel.boundingBox()).y).toBeGreaterThan(nav.y);
    for (let index = 0; index < count; index += 1) {
      await tabs.nth(index).scrollIntoViewIfNeeded();
      await tabs.nth(index).click();
      await expect(tabs.nth(index)).toHaveAttribute("aria-selected", "true");
      await expect(panel).toBeVisible();
    }
  });
});
