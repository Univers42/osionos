/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   seededViews.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The seeded demo dashboards, each on a page of its own holding the database block a
// user gets by inserting a database and picking that view. Home lists the account's
// own data, not these.

import { explorerRow } from "../../browser/core/app.mjs";
import { seedPages } from "./embedSeed.mjs";

const SEEDED_VIEWS = {
  "Overview Dashboard": ["db-products", "v-prod-dashboard"],
  "Formula Analytics": ["db-products", "v-prod-formula-dash"],
  "Relation Analytics": ["db-projects", "v-proj-dashboard"],
};

export async function openSeededView(page, name) {
  await seedPages(page, Object.entries(SEEDED_VIEWS).map(([title, [databaseId, viewId]]) => ({
    _id: `seeded-${viewId}`, title, content: [{ id: `seeded-${viewId}-block`, type: "database_inline", content: "", databaseId, viewId }],
  })));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await explorerRow(page, name).click();
  await page.locator("[data-dash-row]").first().waitFor({ timeout: 30_000 });
}
