/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceTeams.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { giveTheAppABridgeOrigin, seedSession } from "../support/profilePageMocks.mjs";

const region = (page) => page.getByRole("region", { name: "Settings", exact: true });

test.describe("the teams block of the Teamspaces settings page", () => {
  test("shows the empty state, then a created team as a row", async ({ page, baseURL }) => {
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) consoleErrors.push(message.text());
    });

    await page.goto(new URL("/?settings=teamspaces#teams", baseURL).toString());
    const r = region(page);
    await expect(r).toBeVisible();
    await expect(r.getByRole("heading", { name: "Teams", exact: true })).toBeVisible();
    await expect(r.getByText("No teams yet")).toBeVisible();

    await r.getByLabel("New team name").fill("Design");
    await r.getByRole("button", { name: "Create team" }).click();

    await expect(r.getByLabel("Team name", { exact: true })).toHaveValue("Design");
    await expect(r.getByText("No teams yet")).toHaveCount(0);

    expect(consoleErrors).toEqual([]);
  });

  test("a member row and the picker show names, not ids", async ({ page, baseURL }) => {
    const team = { id: "team-1", name: "Design", description: "", memberCount: 1, myRole: null, createdAt: null, updatedAt: null };
    const rows = [{ userId: "user-ada", name: "Ada Lovelace", role: "member", addedAt: null }];
    await page.route("**/api/workspaces/*/teams/team-1/members**", (route) => route.fulfill({ json: { members: rows, nextCursor: null } }));
    await page.route("**/api/workspaces/*/teams?**", (route) => route.fulfill({ json: { teams: [team], nextCursor: null } }));
    await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
    await openFreshPage(page, baseURL);
    const workspaceId = await page.evaluate(() => globalThis.__playgroundUserStore.getState().activeWorkspace()?._id ?? "local-workspace");
    await seedSession(page);
    await page.evaluate((id) => {
      globalThis.__playgroundUserStore.setState({ personas: [{ id: "user-grace", email: "g@x.test", password: "", name: "Grace Hopper", emoji: "G", roleBadge: "" }] });
      const member = (userId, name) => ({ _id: `wm-${userId}`, workspaceId: id, userId, name, role: "member", joinedAt: "", createdAt: "", updatedAt: "", removedAt: null });
      localStorage.setItem("osionos:settings:workspace-members", JSON.stringify({ state: { data: { [id]: [member("user-ada"), member("user-grace"), member("user-lin", "Lin Clark")] } }, version: 0 }));
    }, workspaceId);
    await page.reload();
    await seedSession(page);
    await page.evaluate(() => globalThis.__playgroundUserStore.setState({ personas: [{ id: "user-grace", email: "g@x.test", password: "", name: "Grace Hopper", emoji: "G", roleBadge: "" }] }));

    const palette = page.getByRole("combobox", { name: "Search pages or run a command" });
    await palette.fill(">teams");
    await page.getByRole("option", { name: /^Teams\b/ }).first().click();
    const r = region(page);
    await r.getByRole("button", { name: "Members", exact: true }).click();
    const roster = r.getByLabel("Design members");
    await expect(roster.getByText("Ada Lovelace")).toBeVisible();
    await expect(roster.getByText("user-ada")).toHaveCount(0);
    await expect(roster.getByRole("option", { name: "Grace Hopper" })).toHaveCount(1);
    await expect(roster.getByRole("option", { name: "user-grace" })).toHaveCount(0);
    await expect(roster.getByRole("option", { name: "Lin Clark" })).toHaveCount(1);
  });
});
