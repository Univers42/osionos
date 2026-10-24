/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   shareTeams.spec.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P3-5-e: a team is a share target. The dialog lists the workspace teams above the people
// when the server says it enforces team rules, picking one adds a row with the team name and
// its member count, and the Teams group stays hidden when the server does not say so.
// Caveat: the offline build has no bridge origin, so it is pointed at the test origin; the bridge is faked at the network edge (its answers are pinned by tests/bridge);
// this spec covers the dialog only.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { giveTheAppABridgeOrigin, seedSession } from "../support/profilePageMocks.mjs";

const TEAM = { id: "88888888-8888-4888-8888-888888888888", name: "Design", memberCount: 3 };
const PERSON = { id: "44444444-4444-4444-8444-444444444444", email: "ada@example.test", name: "Ada Design", role: "analyst" };

async function fakeShareBridge(page, { teamRules }) {
  const stored = [];
  const sharing = { visibility: "private", collaborators: [] };
  await page.route("**/api/workspaces/*/members**", (route) => route.fulfill({ json: {
    members: [{ userId: PERSON.id, name: PERSON.name, role: "viewer" }],
  } }));
  await page.route("**/api/pages/*", async (route) => {
    if (route.request().method() === "PATCH") {
      Object.assign(sharing, route.request().postDataJSON());
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: sharing });
  });
  await page.route("**/api/perms/people**", (route) => route.fulfill({ json: { people: [PERSON] } }));
  await page.route("**/api/workspaces/*/teams**", (route) => route.fulfill({ json: { teams: [TEAM], nextCursor: null } }));
  await page.route("**/api/perms/rules**", async (route) => {
    if (route.request().method() === "POST") {
      const rule = { ...route.request().postDataJSON(), _id: "r1" };
      stored.push(rule);
      return route.fulfill({ json: { rule } });
    }
    return route.fulfill({ json: { rules: stored, ...(teamRules ? { teamRules: true } : {}) } });
  });
  return stored;
}

async function openShare(page, baseURL) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
  await openFreshPage(page, baseURL);
  await seedSession(page);
  await page.getByRole("button", { name: "Share page" }).click();
  return page.getByRole("dialog", { name: "Share" });
}

test("the dialog lists the teams above the people, and a picked team becomes a row", async ({ page, baseURL }) => {
  const stored = await fakeShareBridge(page, { teamRules: true });
  const dialog = await openShare(page, baseURL);

  await dialog.getByPlaceholder(/Add teams or people/).fill("design");
  const teamsLabel = dialog.getByText("Teams", { exact: true });
  const peopleLabel = dialog.getByText("People", { exact: true });
  await expect(teamsLabel).toBeVisible();
  await expect(peopleLabel).toBeVisible();
  expect((await teamsLabel.boundingBox()).y).toBeLessThan((await peopleLabel.boundingBox()).y);

  await dialog.getByRole("button", { name: /Design\s*3 members/ }).click();

  await expect(dialog.getByText("Design", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Team · 3 members")).toBeVisible();
  expect(stored[0].target).toEqual({ type: "team", teamId: TEAM.id });
});

test("the Teams group stays hidden while the server does not enforce team rules", async ({ page, baseURL }) => {
  await fakeShareBridge(page, { teamRules: false });
  const dialog = await openShare(page, baseURL);

  await dialog.getByPlaceholder(/Add people by name/).fill("design");
  await expect(dialog.getByRole("button", { name: /Ada Design/ })).toBeVisible();
  await expect(dialog.getByText("Teams", { exact: true })).toHaveCount(0);
});


test("a page collaborator and a team rule survive reopening the same dialog", async ({ page, baseURL }) => {
  const stored = await fakeShareBridge(page, { teamRules: true });
  let dialog = await openShare(page, baseURL);
  await dialog.getByPlaceholder(/Add teams or people/).fill("ada");
  await dialog.getByRole("button", { name: /Ada Design/ }).click();
  await expect(dialog.getByRole("button", { name: "Remove access for Ada Design" })).toBeVisible();
  await dialog.getByPlaceholder(/Add teams or people/).fill("design");
  await dialog.getByRole("button", { name: /Design\s*3 members/ }).click();
  await expect(dialog.getByText("Team · 3 members")).toBeVisible();
  expect(stored[0].target).toEqual({ type: "team", teamId: TEAM.id });

  await dialog.getByRole("button", { name: "Close share dialog" }).click();
  await page.getByRole("button", { name: "Share page" }).click();
  dialog = page.getByRole("dialog", { name: "Share" });
  await expect(dialog.getByRole("button", { name: "Remove access for Ada Design" })).toBeVisible();
  await expect(dialog.getByText("Team · 3 members")).toBeVisible();
  await dialog.getByRole("button", { name: "Remove access for Ada Design" }).click();
  await expect(dialog.getByRole("button", { name: "Remove access for Ada Design" })).toHaveCount(0);
  await expect(dialog.getByText("Team · 3 members")).toBeVisible();
});
