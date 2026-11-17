/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profileEdit.spec.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// U2: the profile page edits in place. Every field of the form is changed, saved through the
// mocked account backend and read back after a reload; a 412 shows the server's row; a failed
// status save keeps the profile edit and the reverse; keyboard, focus and axe in edit mode.
// Caveat: the bridge is a stateful mock (profilePageMocks.mjs), so this proves the client's
// contract with it (If-Match, the two endpoints), not the server's behaviour.

import { mkdirSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { accountBackend, expectNoErrorToast, giveTheAppABridgeOrigin, heading, mockAccountBackend, mockApi, openProfileFromPalette, seedSession } from "../support/profilePageMocks.mjs";

const SHOTS = "target/shots/profile";
const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SELF = "me-user";
// A long handle is what pushes the "Change username" button to wrap at 375 px.
const LONG_USERNAME = "me-user-with-a-rather-long-handle";

async function openOwnPage(page, baseURL, seed = {}, theme = "light", username = SELF) {
  await page.addInitScript((mode) => localStorage.setItem("osionos:theme-mode", mode), theme);
  await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
  await openFreshPage(page, baseURL);
  const mine = await seedSession(page);
  const backend = accountBackend(mine, username, seed);
  await page.route(/\/api\/(social|app-connections|connections)/, (route) => route.fulfill({ json: { blocks: [], connections: [], edges: [] } }));
  await mockApi(page, { id: mine, username, name: "Me Myself", publicBody: backend.card() });
  await mockAccountBackend(page, backend, username);
  await openProfileFromPalette(page, "Me");
  await expect(heading(page, "Me Myself")).toBeVisible();
  return backend;
}

const edit = (page) => page.getByRole("button", { name: "Edit profile", exact: true });
const field = (page, label) => page.getByLabel(label, { exact: true });

async function fillEveryField(page) {
  await field(page, "Display name").fill("Ada Lovelace");
  await field(page, "Pronouns").selectOption("custom");
  await page.getByLabel("Custom pronouns").fill("xe/xem");
  await field(page, "Headline").fill("Analyst");
  await field(page, "Bio").fill("Notes on the engine.\nSecond line.");
  await page.getByRole("button", { name: /In a meeting/ }).click();
  await page.getByRole("switch", { name: "Busy" }).click();
  await page.getByLabel("Clear status").selectOption({ label: "Clear in 1 hour" });
  await field(page, "Location").selectOption({ label: "France" });
  await page.getByLabel("City").fill("Lyon");
  await field(page, "Company").fill("Analytical Engines");
  await field(page, "Website").fill("https://ada.example.com");
  await page.getByRole("button", { name: "Add link" }).click();
  await page.getByLabel("Link 1", { exact: true }).fill("https://github.com/ada");
  await expect(page.getByTestId("link-kind").first()).toHaveText("GitHub");
  await field(page, "Local time").selectOption("Europe/Paris");
  await field(page, "ORCID").fill("0000-0002-1825-0097");
  await field(page, "Patreon").fill("adadraws");
}

async function reopen(page, baseURL) {
  await page.reload();
  await openFreshPage(page, baseURL);
  await seedSession(page);
  await openProfileFromPalette(page, "Me");
}

test("every field is edited on the page, saved, and read back after a reload", async ({ page, baseURL }) => {
  const backend = await openOwnPage(page, baseURL);
  await edit(page).click();
  await expect(field(page, "Display name")).toBeFocused();
  await expect(page.getByRole("button", { name: "Change username" })).toBeVisible();
  await fillEveryField(page);
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(edit(page)).toBeFocused();
  expect(backend.calls.profile).toHaveLength(1);
  expect(backend.calls.profile[0].ifMatch).toBe('"1"');
  expect(backend.row).toMatchObject({
    displayName: "Ada Lovelace", pronouns: "xe/xem", headline: "Analyst", bio: "Notes on the engine.\nSecond line.",
    location: "Lyon, France", company: "Analytical Engines", website: "https://ada.example.com",
    links: ["https://github.com/ada"], timezone: "Europe/Paris", orcid: "0000-0002-1825-0097", patreon: "adadraws",
  });
  expect(backend.calls.status).toHaveLength(1);
  expect(backend.calls.status[0]).toMatchObject({ emoji: "📅", text: "In a meeting", busy: true });
  expect(new Date(backend.calls.status[0].expiresAt).getTime()).toBeGreaterThan(Date.now() + 55 * 60_000);

  await reopen(page, baseURL);
  await expect(heading(page, "Ada Lovelace")).toBeVisible();
  const side = page.getByRole("complementary", { name: "Profile details" });
  for (const saved of ["xe/xem", "Analyst", "Notes on the engine.", "Lyon, France", "Analytical Engines", "In a meeting"]) {
    await expect(side.getByText(saved).first()).toBeVisible();
  }
  await expect(side.getByRole("link", { name: "github.com" })).toBeVisible();
  await expect(side.getByTestId("local-time")).toHaveText(/\d{1,2}:\d{2}/);
});

test("a 412 shows the conflict banner with the server's row", async ({ page, baseURL }) => {
  const backend = await openOwnPage(page, baseURL);
  backend.conflictNext = { displayName: "Server Name", headline: "Changed elsewhere" };
  await edit(page).click();
  await field(page, "Display name").fill("My Edit");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const banner = page.getByRole("alert").filter({ hasText: "changed somewhere else" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Use the saved version" }).click();
  await expect(field(page, "Display name")).toHaveValue("Server Name");
  await expect(field(page, "Headline")).toHaveValue("Changed elsewhere");
});

test("a failed status save keeps the profile edit, and it is reported", async ({ page, baseURL }) => {
  const backend = await openOwnPage(page, baseURL);
  backend.failStatus = true;
  await edit(page).click();
  await field(page, "Headline").fill("Saved anyway");
  await page.getByRole("button", { name: /Focusing/ }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Your status could not be saved" })).toBeVisible();
  expect(backend.row.headline).toBe("Saved anyway");
  await expect(field(page, "Headline")).toHaveValue("Saved anyway");
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue("Focusing");
  backend.failStatus = false;
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(edit(page)).toBeFocused();
  expect(backend.status).toMatchObject({ text: "Focusing" });
});

test("a failed profile save keeps the status edit, and the status is saved", async ({ page, baseURL }) => {
  const backend = await openOwnPage(page, baseURL);
  backend.failProfile = true;
  await edit(page).click();
  await field(page, "Headline").fill("Not saved yet");
  await page.getByRole("button", { name: /On vacation/ }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => backend.status?.text).toBe("On vacation");
  expect(backend.row.headline).toBeNull();
  await expect(field(page, "Headline")).toHaveValue("Not saved yet");
  backend.failProfile = false;
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(edit(page)).toBeFocused();
  expect(backend.row.headline).toBe("Not saved yet");
});

test("an empty-section prompt opens the editor on its field", async ({ page, baseURL }) => {
  await openOwnPage(page, baseURL);
  await page.getByRole("button", { name: "Add a bio" }).click();
  await expect(field(page, "Bio")).toBeFocused();
});

test("keyboard: Edit opens on the first field, Cancel returns to Edit, errors are announced", async ({ page, baseURL }) => {
  await openOwnPage(page, baseURL);
  await edit(page).focus();
  await page.keyboard.press("Enter");
  await expect(field(page, "Display name")).toBeFocused();
  await field(page, "Display name").fill("");
  const error = page.getByRole("alert").filter({ hasText: "Display name is required" });
  await expect(error).toBeVisible();
  await expect(field(page, "Display name")).toHaveAttribute("aria-invalid", "true");
  await field(page, "Display name").fill("Me Myself");
  await page.getByRole("button", { name: "Cancel", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(edit(page)).toBeFocused();
});

for (const theme of ["light", "dark"]) {
  test(`axe: the profile page in edit mode, ${theme}`, async ({ page, baseURL }) => {
    await openOwnPage(page, baseURL, {}, theme);
    await edit(page).click();
    await expect(field(page, "Display name")).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).include("aside").withTags(WCAG_AA).analyze();
    expect(violations.map((v) => ({ id: v.id, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) }))).toEqual([]);
  });
}

for (const width of [375, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`edit mode fits at ${width}px, ${theme}, and is shot`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 900 });
      await openOwnPage(page, baseURL, { headline: "Analyst", bio: "Notes", links: ["https://github.com/ada"] }, theme, LONG_USERNAME);
      await edit(page).click();
      await expect(field(page, "Display name")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await expectNoErrorToast(page);
      const row = page.getByTestId("username-row");
      const button = row.getByRole("button", { name: "Change username" });
      // The button has a fixed height, so a wrapped label overflows it unseen: count the text's line boxes.
      const lines = await button.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
      });
      expect(lines).toBe(1);
      const [rowBox, buttonBox] = [await row.boundingBox(), await button.boundingBox()];
      expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
      // The photo row draws the same Avatar atom as read mode: initials, not the 👤 placeholder.
      await expect(page.locator("form").getByText("MM", { exact: true })).toBeVisible();
      mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: `${SHOTS}/edit-${width}-${theme}.png` });
    });
  }
}
