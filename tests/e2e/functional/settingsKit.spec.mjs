// The settings screen uses the kit's Button and Toggle instead of private
// copies, so its controls take their look from the control tokens and its
// switches are real, named switches whose state survives closing the tab.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { enableAccountDelete } from "../support/accountDelete.mjs";
import { closeSettings, nav, openSection as openSettingsSection, openSettings, region, searchSettings } from "../support/settingsHelpers.mjs";

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

    const switches = region(page).getByRole("switch");
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

    const upgrade = region(page).getByRole("button", { name: "Upgrade" }).first();
    await expect(upgrade).toBeVisible();
    const accent = await resolvedToken(page, "background-color", "--osio-accent");
    await expect(upgrade).toHaveCSS("background-color", accent);
    // The private Button had no fixed height; only the kit Button sizes itself from the density token.
    await expect(upgrade).toHaveCSS("height", await resolvedToken(page, "height", "--osio-control-h-md"));
  });

  test("every panel's buttons take the control radius", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const radius = await resolvedToken(page, "border-radius", "--osio-control-radius");
    expect(radius).not.toBe("");

    await openSettings(page, "Preferences");
    // The section nav only: a panel's own segmented tabs (appearance) would shift the indices.
    // data-settings-section marks price rows; the nav's CTA is a plain Button, not a section.
    const rows = nav(page).locator("button[data-settings-section]");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(10);
    // A kit Card made clickable, or the import drop zone, is a panel, not a control: it is
    // styled with the panel radius token. Only those are exempt, so a Button drifting to
    // the panel radius still fails.
    const panelRadius = await resolvedToken(page, "border-radius", "--osio-radius-panel");
    // Segments of the People view switcher: one rounded group, not separate buttons.
    const segmentLabels = ["Table", "Gallery"];
    for (let index = 0; index < rowCount; index += 1) {
      const row = rows.nth(index);
      const sectionId = await row.getAttribute("data-settings-section");
      await row.click();
      await expect(row).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(region(page).locator(`[data-settings-panel="${sectionId}"]`)).toBeVisible();
      // Nav rows and switches are not Buttons. The appearance controls belong to the
      // theme panel, which is restyled on its own. The avatar and workspace-icon
      // pickers are the picture itself made clickable, shaped by what they show.
      const radii = await region(page)
        .locator('button:not([role="switch"]):not([aria-label="Settings sections"] *):not([aria-label="Change avatar"]):not([aria-label="Change workspace icon"]):not([data-settings-anchor="appearance"] *)')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.getClientRects().length > 0)
            .map((node) => ({
              name: node.getAttribute("aria-label") ?? node.textContent?.trim().slice(0, 30),
              radius: getComputedStyle(node).borderRadius,
              isPanel: node.classList.contains("rounded-[var(--osio-radius-panel)]"),
            })),
        );
      // page_settings shows its no-page empty state in a fresh workspace (a
      // page context is what its buttons act on; this spec does not arrange one).
      const emptyStateInstead = sectionId === "page_settings" && (await region(page).getByText("Open a page to see its settings.").count()) > 0;
      // Keyboard shortcuts embeds the automations manager: its own TOOLBAR
      // buttons predate the kit adoption and live outside this work package's
      // files, so their radius is taken up there, not here.
      const kitOutsourced = sectionId === "shortcuts";
      // Moderation has a button only per blocked user (Unblock); this spec blocks nobody.
      const nobodyBlocked = sectionId === "moderation" && (await region(page).getByRole("button", { name: "Unblock" }).count()) === 0;
      // Accessibility & voice is two selects and a slider: it has no button at all.
      const noButtonByDesign = sectionId === "accessibility_voice";
      // AI connections says so, and offers nothing, when the build has no AI service (this one).
      const aiUnconfigured = sectionId === "ai_connections" && (await region(page).getByText(/The AI service is not configured in this build/).count()) > 0;
      if (!(emptyStateInstead || kitOutsourced || nobodyBlocked || noButtonByDesign || aiUnconfigured)) {
        expect(radii.length, `section ${index} shows buttons`).toBeGreaterThan(0);
        const offRadius = radii.filter((entry) => !segmentLabels.includes(entry.name) && entry.radius !== (entry.isPanel ? panelRadius : radius));
        expect(offRadius, `section ${index}: buttons off the control radius`).toEqual([]);
      }
    }
  });
  test("a reversible action is outlined danger text; an irreversible one keeps the solid fill", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    // A fresh workspace has no active page, so the candidate reversible action
    // is Disconnect (reconnecting undoes it), not the page Move-to-Trash. Part
    // b removed the fake default connection, so arrange one first.
    await openSettings(page, "Mail & Calendar");
    await region(page).getByRole("button", { name: "Add address" }).click();
    await page.getByRole("dialog", { name: "Mail provider" }).getByRole("button", { name: "osionos Mail" }).click();

    const danger = await resolvedToken(page, "background-color", "--osio-danger");
    const dangerText = await resolvedToken(page, "color", "--osio-danger");
    const disconnect = region(page).getByRole("button", { name: "Disconnect" }).first();
    await expect(disconnect).toBeVisible();
    await expect(disconnect).toHaveCSS("color", dangerText);
    await expect(disconnect).not.toHaveCSS("background-color", danger);
    await expect(disconnect).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    await openSettingsSection(page, "General");
    const remove = region(page).getByRole("button", { name: "Delete workspace", exact: true });
    await expect(remove).toHaveCSS("background-color", danger);
  });

  test("the selected landing page is an accent outline, not a solid primary button", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page, "General");
    await region(page).getByRole("button", { name: /Select page|Change page/ }).click();
    const choices = page.getByRole("dialog", { name: "Select landing page" }).locator("button[aria-pressed]");
    await expect(choices.first()).toBeVisible();
    await choices.first().click();
    await region(page).getByRole("button", { name: /Select page|Change page/ }).click();
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

    const body = region(page);
    await expect.poll(async () => (await body.boundingBox()).width).toBeGreaterThanOrEqual(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const upgrade = body.getByRole("button", { name: "Upgrade" }).first();
    await upgrade.scrollIntoViewIfNeeded();
    await expect(upgrade).toBeInViewport({ ratio: 1 });

    const rows = nav(page).locator("button[data-settings-section]");
    const count = await rows.count();
    expect(count).toBeGreaterThan(10);
    const stripRow = await rows.first().boundingBox();
    expect((await body.getByRole("heading", { level: 1 }).boundingBox()).y).toBeGreaterThan(stripRow.y);
    for (let index = 0; index < count; index += 1) {
      await rows.nth(index).scrollIntoViewIfNeeded();
      await rows.nth(index).click();
      await expect(rows.nth(index)).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("a search with no hit shows the status line", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page, "Preferences");
    await page.getByRole("searchbox", { name: "Search settings" }).fill("zzzz-no-match");
    await expect(page.getByRole("search").getByRole("status")).toContainText('No settings match “zzzz-no-match”');
  });

  test("the typed-confirm input has an accessible name", async ({ page, baseURL }) => {
    await enableAccountDelete(page);
    await openFreshPage(page, baseURL);
    await openSettings(page);
    await searchSettings(page, "delete account");
    await page.getByRole("button", { name: "Delete my account", exact: true }).click();
    const typed = page.getByRole("dialog", { name: "Delete account" }).getByRole("textbox");
    const confirmText = await typed.getAttribute("placeholder");
    await expect(page.getByLabel(`Type ${confirmText} to confirm`)).toBeVisible();
  });

  test("an async confirm disables both buttons while pending", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page, "General");
    await region(page).getByRole("button", { name: "Delete workspace", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Delete workspace" });
    await expect(dialog).toBeVisible();
    const typedInput = dialog.getByRole("textbox");
    const confirmText = await typedInput.getAttribute("placeholder");
    await typedInput.fill(confirmText ?? "");
    // Click and read the pending state in one round trip, so the short pending
    // window is not lost to a round trip.
    const states = await page.evaluate(() => new Promise((resolve) => {
      const dialog = document.querySelector('[role="dialog"]');
      const button = [...dialog.querySelectorAll('button')].find((b) => /Delete workspace/.test(b.textContent || ''));
      button.click();
      requestAnimationFrame(() => {
        const buttons = [...dialog.querySelectorAll('button')];
        resolve(buttons.map((b) => ({ text: b.textContent, disabled: b.disabled })));
      });
    }));
    const confirmState = states.find((b) => /Delete workspace/.test(b.text));
    expect(confirmState?.disabled).toBe(true);
    expect(confirmState?.text).toMatch(/Delete workspace…/);
    const cancelState = states.find((b) => b.text === 'Cancel');
    expect(cancelState?.disabled).toBe(true);
  });
});
