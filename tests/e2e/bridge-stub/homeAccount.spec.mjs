/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   homeAccount.spec.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The account Home counts the signed-in person's own records: four sys: sources
// served by the stub bridge, each shown through its editable starter dashboard.

import { test, expect } from "@playwright/test";

import { stubSysViews } from "../support/sysViewsBridge.mjs";

const at = (hour) => `2026-10-22T${String(hour).padStart(2, "0")}:00:00.000Z`;
const SOURCES = [
  { source: "my-tasks", columns: ["page_id", "block_id", "workspace_id", "content", "checked", "due_at", "updated_at"], rows: [
    { page_id: "p1", block_id: "b1", content: "Write the brief", checked: false, due_at: "2026-10-30", updated_at: at(10) },
    { page_id: "p1", block_id: "b2", content: "Book the room", checked: false, due_at: "2026-10-28", updated_at: at(9) },
    { page_id: "p2", block_id: "b3", content: "Send invites", checked: true, due_at: "2026-10-25", updated_at: at(8) },
  ] },
  { source: "my-pages", columns: ["id", "title", "surface", "updated_at"], rows: [
    { id: "pg1", title: "Roadmap", surface: "doc", updated_at: at(10) },
    { id: "pg2", title: "Notes", surface: "doc", updated_at: at(9) },
    { id: "pg3", title: "Helper", surface: "agent", updated_at: at(8) },
    { id: "pg4", title: "Budget", surface: "doc", updated_at: at(7) },
  ] },
  { source: "my-connections", columns: ["id", "requester_id", "addressee_id", "status", "source", "created_at", "responded_at", "direction", "peer"], rows: [
    { id: "c1", requester_id: "u1", addressee_id: "me", status: "accepted", source: "manual", created_at: at(10), peer: { userId: "u1", name: "Amy" } },
    { id: "c2", requester_id: "u2", addressee_id: "me", status: "accepted", source: "manual", created_at: at(9), peer: { userId: "u2", name: "Bob" } },
    { id: "c3", requester_id: "me", addressee_id: "u3", status: "pending", source: "manual", created_at: at(8), peer: { userId: "u3", name: "Cal" } },
  ] },
  { source: "my-workspaces", columns: ["workspace_id", "role", "permissions", "id", "name", "slug", "created_at", "updated_at"], rows: [
    { workspace_id: "w1", role: "owner", id: "w1", name: "Studio", slug: "studio", created_at: at(10), updated_at: at(10) },
  ] },
];

const kpi = (page, label) => page.locator("[data-dash-kpi]")
  .filter({ has: page.getByText(label, { exact: true }) }).locator("[data-dash-kpi-value]");

async function openHome(page, baseURL) {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.locator('[role="tab"][aria-label="Home"]').click();
  await page.getByRole("menuitem", { name: "Dashboard" }).click();
  await expect(kpi(page, "Open")).toHaveText("2", { timeout: 20_000 });
}

test.describe("home account", () => {
  test("Home counts your own tasks, pages and people", async ({ page, baseURL }) => {
    await stubSysViews(page, { sources: SOURCES });
    await openHome(page, baseURL);
    await expect(kpi(page, "Done")).toHaveText("1");
    await expect(kpi(page, "Pages")).toHaveText("4");
    await expect(kpi(page, "Connected")).toHaveText("2");
    await expect(kpi(page, "Requests")).toHaveText("1");
    await expect(kpi(page, "Workspaces")).toHaveText("1");
  });

  test("New page on Home opens a new page", async ({ page, baseURL }) => {
    await stubSysViews(page, { sources: SOURCES });
    await openHome(page, baseURL);
    await page.locator('[data-draggable-block-id$="home-actions-block-button-new-page"]')
      .getByRole("button", { name: "New page", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Page title" })).toBeVisible({ timeout: 15_000 });
  });

  test("a renamed Home tile is saved under its dashboard and survives a reload", async ({ page, baseURL }) => {
    const bridge = await stubSysViews(page, { sources: SOURCES });
    await openHome(page, baseURL);
    const tasks = page.locator('.osionos-database-block[data-database-id="sys:my-tasks"]');
    await tasks.getByRole("button", { name: "Edit layout" }).click();
    await tasks.locator('[aria-label="Widget actions"]').first().click();
    await page.getByRole("button", { name: "Rename widget" }).click();
    await page.getByRole("textbox", { name: "Widget title" }).fill("To do");
    await page.getByRole("textbox", { name: "Widget title" }).press("Enter");
    await expect.poll(() => bridge.puts.map((put) => put.path))
      .toContain("/api/account/self-data/views/my-tasks/my-tasks-home-dashboard");
    await tasks.getByRole("button", { name: "Done" }).click();

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('[role="tab"][aria-label="Home"]').click();
    await page.getByRole("menuitem", { name: "Dashboard" }).click();
    await expect(kpi(page, "To do")).toHaveText("2", { timeout: 20_000 });
  });
});

test.describe("home account screenshots", () => {
  test.skip(process.env.DASH_SCREENS !== "1", "screenshots only");
  for (const theme of ["light", "dark"]) {
    for (const [width, height] of [[1440, 900], [400, 860]]) {
      test(`screenshots: home ${theme} ${width}`, async ({ page, baseURL }) => {
        await page.addInitScript((mode) => { localStorage.setItem("osionos:theme-mode", mode); }, theme);
        await stubSysViews(page, { sources: SOURCES });
        await page.setViewportSize({ width, height });
        await openHome(page, baseURL);
        await expect(kpi(page, "Requests")).toHaveText("1");
        // Home scrolls inside its pane, so each shot is one viewport: the top, then the people section.
        await page.screenshot({ path: `target/screens/home-account-${theme}-${width}.png` });
        await page.locator('[data-block-type="heading_2"]', { hasText: "Your people" }).first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: `target/screens/home-account-${theme}-${width}-people.png` });
      });
    }
  }
});
