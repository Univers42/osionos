/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsStatus.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Settings > Presence and status hosts the profile page's status fields: same presets, same
// endpoint, its own Save. Caveat: the account backend is a mock (profilePageMocks.mjs).

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { accountBackend, giveTheAppABridgeOrigin, mockAccountBackend, mockApi, seedSession } from "../support/profilePageMocks.mjs";
import { openSettings, region, searchSettings } from "../support/settingsHelpers.mjs";

test("the settings status saves a preset through the status endpoint, and Clear empties it", async ({ page, baseURL }) => {
  await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
  await openFreshPage(page, baseURL);
  const mine = await seedSession(page);
  const backend = accountBackend(mine, "me-user", {});
  await page.route(/\/api\/(social|app-connections|connections)/, (route) => route.fulfill({ json: { blocks: [], connections: [], edges: [] } }));
  await mockApi(page, { id: mine, username: "me-user", name: "Me Myself", publicBody: backend.card() });
  await mockAccountBackend(page, backend, "me-user");
  await openSettings(page);
  await searchSettings(page, "presence");

  const panel = region(page);
  await expect(panel.getByRole("button", { name: "Save status" })).toBeDisabled();
  await panel.getByRole("button", { name: /Focusing/ }).click();
  await panel.getByRole("button", { name: "Save status" }).click();
  await expect(panel.getByRole("status").filter({ hasText: "Status saved." })).toBeVisible();
  expect(backend.calls.status).toHaveLength(1);
  expect(backend.calls.status[0]).toMatchObject({ text: "Focusing" });

  await panel.getByRole("button", { name: "Clear", exact: true }).click();
  await panel.getByRole("button", { name: "Save status" }).click();
  await expect.poll(() => backend.calls.status.length).toBe(2);
  expect(backend.calls.status[1]).toMatchObject({ emoji: null, text: null });
});
