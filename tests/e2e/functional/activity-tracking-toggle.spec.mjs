/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   activity-tracking-toggle.spec.mjs                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P4-5-app: Settings, Preferences, Privacy: the opt-in to the activity log. The preferences
// route is mocked, so the spec proves what the client sends and shows; the 422 on a
// non-boolean and the 60 s gate are the bridge's and are covered by the bridge suites.

import { expect, test } from "@playwright/test";

import { giveTheAppABridgeOrigin, stubRestOfTheBridge } from "../support/bridgeSession.mjs";
import { openSettings, region } from "../support/settingsHelpers.mjs";

const ROUTE = "**/api/preferences";
const SENTENCE = /Turning it off stops new events within a minute\. It does not delete past ones; deleting your account erases them\./;

async function openPrivacy(page, baseURL, onPatch) {
  const patches = [];
  await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
  await stubRestOfTheBridge(page);
  await page.route(ROUTE, (route) => {
    const request = route.request();
    if (request.method() === "GET") return route.fulfill({ json: { beacon_consent: true } });
    patches.push({ method: request.method(), body: request.postDataJSON() });
    return onPatch(route);
  });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await openSettings(page, "Preferences");
  return { patches, toggle: region(page).getByRole("switch", { name: "Record my activity" }) };
}

test.describe("the activity tracking switch", () => {
  test("it is off by default and the off-notice sits beside it", async ({ page, baseURL }) => {
    const { toggle } = await openPrivacy(page, baseURL, (route) => route.fulfill({ json: {} }));
    await expect(toggle).toBeEnabled();
    await expect(toggle).not.toBeChecked();
    await expect(region(page).getByText(SENTENCE)).toBeVisible();
  });

  test("turning it on sends only activity_tracking and leaves the beacon alone", async ({ page, baseURL }) => {
    const { patches, toggle } = await openPrivacy(page, baseURL, (route) => route.fulfill({ json: { activity_tracking: true } }));
    await toggle.click();
    await expect(toggle).toBeChecked();
    expect(patches).toEqual([{ method: "PATCH", body: { activity_tracking: true } }]);
  });

  test("a failed save puts the switch back and says why", async ({ page, baseURL }) => {
    const { toggle } = await openPrivacy(page, baseURL, (route) => route.fulfill({ status: 500, json: { error: "store_down", message: "The store is down." } }));
    await toggle.click();
    await expect(page.getByText("The switch did not change")).toBeVisible();
    await expect(toggle).not.toBeChecked();
  });
});
