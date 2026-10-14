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
    for (const tabName of ["Preferences", "Notifications", "osionos AI"]) {
      await openSettingsTab(page, tabName);
      // Tabs are navigation rows and switches are pills: neither is a Button. The appearance
      // controls belong to the theme panel, which is restyled on its own.
      const radii = await page
        .getByRole("dialog", { name: "Settings" })
        .locator('button:not([role="tab"]):not([role="switch"]):not([data-settings-anchor="appearance"] *)')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.getClientRects().length > 0)
            .map((node) => ({ name: node.getAttribute("aria-label") ?? node.textContent?.trim().slice(0, 30), radius: getComputedStyle(node).borderRadius })),
        );
      expect(radii.length, `${tabName} shows buttons`).toBeGreaterThan(0);
      expect(radii.filter((entry) => entry.radius !== radius), `${tabName}: buttons off the control radius`).toEqual([]);
    }
  });
});
