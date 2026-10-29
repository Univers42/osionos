/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databasesPanel.mjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect } from "@playwright/test";

/** Opens the Databases rail panel and waits until its catalog has SETTLED: the panel is
 *  React.lazy and loads async, and a check read during "Connecting…" saw neither branch. */
export async function openDatabasesPanel(page, baseURL) {
  await page.goto(baseURL ?? "/", { waitUntil: "domcontentloaded" });
  const railIcon = page.locator('[aria-label="Databases"]').first();
  await railIcon.waitFor({ timeout: 20_000 });
  await railIcon.click();
  await page.getByLabel("Search databases and tables").waitFor({ timeout: 20_000 });
  await expect(page.getByText(/Connecting to your databases/)).toHaveCount(0);
}
