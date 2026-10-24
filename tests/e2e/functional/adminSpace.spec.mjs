/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   adminSpace.spec.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P3-4-b: the Admin space is reachable from the rail for a moderator or an admin, and only
// then. The session is seeded as a bridge record whose app-session token carries the role
// claim; the bridge is stubbed empty, so the spec proves what the client OFFERS — the
// server's refusal is covered by the bridge suites.

import { expect, test } from "@playwright/test";

const USER_ID = "user-admin-space";
const WORKSPACE = { _id: "ws-admin", name: "Home", slug: "home", ownerId: USER_ID, memberIds: [USER_ID], settings: {} };

function sessionRecord(claims) {
  const payload = Buffer.from(JSON.stringify({ sub: USER_ID, exp: Math.floor(Date.now() / 1000) + 3600, ...claims })).toString("base64url");
  return {
    ok: true,
    persona: { id: USER_ID, email: "admin-space@example.test", password: "", name: "Admin Space", emoji: "A", roleBadge: "", persistInSessions: true },
    session: { userId: USER_ID, accessToken: `osionos_v1.${payload}.sig`, refreshToken: "", privateWorkspaces: [WORKSPACE], sharedWorkspaces: [] },
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

async function openAs(page, baseURL, claims) {
  if (claims) {
    await page.addInitScript(
      ([key, record]) => localStorage.setItem(key, JSON.stringify({ [record.session.userId]: record })),
      ["osionos:bridge-session", sessionRecord(claims)],
    );
  }
  // Bridge calls only: a glob like **/api/** would also swallow Vite modules under src/**/api/.
  await page.route((url) => url.pathname.startsWith("/api/"), (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
}

const railAdmin = (page) => page.getByRole("tab", { name: "Admin", exact: true });
const adminTabInStrip = (page) => page.locator('[data-osio-tabstrip] [data-tab-id][title="Admin"]');
const section = (page, name) => page.getByRole("navigation", { name: "Admin sections" }).getByRole("button", { name });

test.describe("the Admin space", () => {
  test("an admin opens one Admin tab from the rail and sees every section", async ({ page, baseURL }) => {
    await openAs(page, baseURL, { platform_role: "admin", is_admin: true });
    await railAdmin(page).click();
    await expect(adminTabInStrip(page)).toHaveCount(1);

    await railAdmin(page).click();
    await expect(adminTabInStrip(page)).toHaveCount(1);

    await expect(section(page, "Templates")).toBeVisible();
    await expect(section(page, "Moderation")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Templates" })).toBeVisible();
  });

  test("a moderator reaches the space but sees Moderation and not Templates", async ({ page, baseURL }) => {
    await openAs(page, baseURL, { platform_role: "moderator", is_admin: false });
    await railAdmin(page).click();
    await expect(adminTabInStrip(page)).toHaveCount(1);

    await expect(section(page, "Moderation")).toBeVisible();
    await expect(section(page, "Templates")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Templates" })).toHaveCount(0);
  });

  test("a plain user has no Admin button", async ({ page, baseURL }) => {
    await openAs(page, baseURL, { platform_role: "user", is_admin: false });
    await expect(page.getByRole("tab", { name: "Explorer", exact: true })).toBeVisible();
    await expect(railAdmin(page)).toHaveCount(0);
  });

  test("with no session there is no Admin button", async ({ page, baseURL }) => {
    await openAs(page, baseURL, null);
    await expect(page.getByRole("tab", { name: "Explorer", exact: true })).toBeVisible();
    await expect(railAdmin(page)).toHaveCount(0);
  });
});
