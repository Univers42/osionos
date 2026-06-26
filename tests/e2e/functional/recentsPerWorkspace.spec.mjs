/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   recentsPerWorkspace.spec.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { test, expect } from "@playwright/test";

import { clearAndTypePageTitle, openFreshPage, waitForRenderStability } from "../../browser/core/app.mjs";

const sidebar = (page) => page.locator('aside[aria-label="Sidebar"]');
const switchWorkspace = (page, id) =>
  page.evaluate((wsId) => window.__playgroundUserStore.getState().switchWorkspace(wsId), id);

test("recents are isolated per workspace and never cross", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  await clearAndTypePageTitle(page, "RECENTW1");
  await waitForRenderStability(page);

  // The page shows in the active workspace's sidebar (recents + tree → ≥1 match).
  await expect(sidebar(page).getByText("RECENTW1").first()).toBeVisible();

  // Read this session's workspaces (offline persona has a private + a shared one).
  const { current, other } = await page.evaluate(() => {
    const store = window.__playgroundUserStore?.getState?.();
    const session = store?.activeSession?.();
    const cur = store?.activeWorkspace?.()?._id ?? null;
    const all = [...(session?.privateWorkspaces ?? []), ...(session?.sharedWorkspaces ?? [])];
    return { current: cur, other: all.map((w) => w._id).find((id) => id && id !== cur) ?? null };
  });
  test.skip(!current || !other, "session has only one workspace");

  // Switching to the other workspace must NOT carry workspace 1's recent.
  await switchWorkspace(page, other);
  await waitForRenderStability(page);
  await expect(sidebar(page).getByText("RECENTW1")).toHaveCount(0);

  // Switching back restores it.
  await switchWorkspace(page, current);
  await waitForRenderStability(page);
  await expect(sidebar(page).getByText("RECENTW1").first()).toBeVisible();
});
