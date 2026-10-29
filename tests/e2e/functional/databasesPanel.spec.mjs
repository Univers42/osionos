/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databasesPanel.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Databases navigator (left rail) in the default OFFLINE build (VITE_API_URL=''): there is no
// bridge to reach, so the panel says so and never presents the mock mounts as the registry.
// The registry list and its failure run against a bridge URL in bridge-stub/databasesPanel.spec.mjs.

import { test, expect } from "@playwright/test";

import { openDatabasesPanel } from "../support/databasesPanel.mjs";

test.describe("databases-navigator (offline build)", () => {
  test("says live databases aren't configured and calls no registry", async ({ page, baseURL }) => {
    const registryCalls = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/databases")) registryCalls.push(request.url());
    });
    await openDatabasesPanel(page, baseURL);
    await expect(page.getByText(/Live databases aren.t configured/)).toBeVisible();
    await expect(page.getByText("pg-commerce", { exact: true })).toHaveCount(0);
    expect(registryCalls).toEqual([]);
  });
});
