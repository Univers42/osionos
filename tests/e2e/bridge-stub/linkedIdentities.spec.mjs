/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   linkedIdentities.spec.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P3-1-c against a stubbed bridge (PLAYWRIGHT_BRIDGE_STUB=1): the Account security section lists
// the identities the server reports, says so when there are none or the route fails, and offers
// neither Link nor Unlink, only the line that says unlinking is not available yet.

import { test, expect } from "@playwright/test";

import { region } from "../support/settingsHelpers.mjs";
import { openProfile } from "../support/sessionsStub.mjs";
import { stubBridge } from "../support/bridgeStub.mjs";

const SETTINGS = { userId: "u", security: {}, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
const GOOGLE = { provider: "google", identityId: "i-1", email: "member@example.com", linkedAt: "2026-09-01T00:00:00Z", lastSignInAt: null };
const GITHUB = { provider: "github", identityId: "i-2", email: null, linkedAt: "2026-09-02T00:00:00Z", lastSignInAt: null };

async function stubIdentities(page, answer) {
  const calls = [];
  await stubBridge(page, (url, request) => {
    if (url.pathname === "/api/account/settings") return { json: SETTINGS };
    if (url.pathname !== "/api/account/identities") return undefined;
    calls.push(request.method());
    return answer;
  });
  return calls;
}

const row = (page) => region(page).getByText("Linked sign-in methods", { exact: true }).first();

test.describe("Linked sign-in methods (bridge stub)", () => {
  test("lists the reported providers with e-mail and date, and offers no Link or Unlink", async ({ page, baseURL }) => {
    const calls = await stubIdentities(page, { json: { identities: [GOOGLE, GITHUB] } });
    await openProfile(page, baseURL);
    const list = region(page).getByRole("list", { name: "Linked sign-in methods" });
    await expect(list).toContainText("Google - member@example.com - linked");
    await expect(list).toContainText("GitHub - linked");
    await expect(region(page)).toContainText("To remove a linked account, contact support; unlinking is not available yet.");
    await expect(region(page).getByRole("button", { name: /unlink|^link/i })).toHaveCount(0);
    expect(calls).toEqual(["GET"]);
  });

  test("says so when no account is linked", async ({ page, baseURL }) => {
    await stubIdentities(page, { json: { identities: [] } });
    await openProfile(page, baseURL);
    await expect(region(page)).toContainText("No linked accounts yet.");
    await expect(row(page)).toBeVisible();
  });

  test("shows an error when the server cannot answer", async ({ page, baseURL }) => {
    await stubIdentities(page, { status: 503, json: { code: "account_plane_unavailable" } });
    await openProfile(page, baseURL);
    await expect(region(page).getByRole("alert").filter({ hasText: "does not report linked sign-in methods" })).toBeVisible();
  });
});
