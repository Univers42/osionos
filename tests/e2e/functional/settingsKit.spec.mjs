// The settings screen uses the kit's Button and Toggle instead of private
// copies, so its controls take their look from the control tokens and its
// switches are real, named switches whose state survives closing the tab.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

/** The settings tab's region; the tab strip owns the closing. exact: the pane's
 *  own "Title bar: Settings" <section> is also role=region by substring. */
function region(page) {
  return page.getByRole("region", { name: "Settings", exact: true });
}

function nav(page) {
  return page.getByRole("navigation", { name: "Settings sections" });
}

/** The selected panel settled: its own marker subtree is on screen, so later
 *  count()/evaluateAll calls never catch a stale panel or the skeleton. */
async function openSettingsSection(page, sectionName, sectionId = null) {
  const row = nav(page).getByRole("button", { name: sectionName, exact: true });
  await row.click();
  const id = sectionId ?? (await row.getAttribute("data-settings-section"));
  await expect(page.getByRole("heading", { level: 1, name: sectionName, exact: true })).toBeVisible();
  await expect(region(page).locator(`[data-settings-panel="${id}"]`)).toBeVisible();
}

async function openSettings(page, sectionName) {
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await region(page).waitFor();
  await openSettingsSection(page, sectionName);
}

async function closeSettings(page) {
  await page.getByRole("button", { name: "Close Settings" }).click();
  await expect(region(page)).toHaveCount(0);
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
      if (!(emptyStateInstead || kitOutsourced)) {
        expect(radii.length, `section ${index} shows buttons`).toBeGreaterThan(0);
        const offRadius = radii.filter((entry) => !segmentLabels.includes(entry.name) && entry.radius !== (entry.isPanel ? panelRadius : radius));
        expect(offRadius, `section ${index}: buttons off the control radius`).toEqual([]);
      }
    }
  });
  test("a reversible action is outlined danger text; an irreversible one keeps the solid fill", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    // A fresh workspace has no active page, so the candidate reversible action
    // is Disconnect (reconnecting undoes it), not the page Move-to-Trash.
    await openSettings(page, "Mail & Calendar");
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
});

