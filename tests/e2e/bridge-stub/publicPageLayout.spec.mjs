/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   publicPageLayout.spec.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #61: a published canvas page lost its layout (the snapshot dropped the block), and a
// formula-gated cell could never show on /p/<token>, which has no properties to evaluate
// it with. The stored copy here is built by the bridge's own snapshot function from an
// owner's page, with the gated cell the owner's view showed, so the reader sees what the
// owner saw. Offline: the public-page API is answered by the test (PLAYWRIGHT_BRIDGE_STUB).

import { expect, test } from "@playwright/test";

import { publishSnapshot } from "../../../scripts/bridge-publish-snapshot.mjs";
import { stubBridge } from "../support/bridgeStub.mjs";

const TOKEN = "fedcba9876543210fedcba9876543210";
const cell = (id, colStart, rowStart, extra) => ({ id, colStart, colSpan: 6, rowStart, rowSpan: 1, ...extra });
const text = (id, content) => [{ id, type: "paragraph", content }];

const OWNER_PAGE = [
  { id: "intro", type: "paragraph", content: "Our team, on one canvas." },
  { id: "grid", type: "layout", content: "", layoutConfig: { columns: 12, rowHeight: 96, gap: 16 }, layoutCells: [
    cell("about", 1, 1, { label: "About", tint: "color-mix(in srgb, #2563eb 8%, var(--osio-bg-surface))", blocks: text("p1", "We build the editor.") }),
    cell("status", 7, 1, { label: "Status", visibilityFormula: 'prop("Status") == "Done"', blocks: text("p2", "Shipped on Friday.") }),
    cell("draft", 1, 2, { label: "Draft", visibilityFormula: 'prop("Status") == "Draft"', blocks: text("p3", "Unreleased notes.") }),
  ] },
];

const PUBLISHED = {
  ok: true, title: "Team page", icon: null, publishedAt: "2026-10-30T00:00:00.000Z",
  content: publishSnapshot(OWNER_PAGE, { shown: new Set(["status"]) }),
};

test("a published canvas page shows its layout and the gated cell the owner's view showed", async ({ page }) => {
  await stubBridge(page, (url) => (url.pathname === `/api/public/pages/${TOKEN}` ? { json: PUBLISHED } : undefined));
  await page.goto(`/p/${TOKEN}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Team page" })).toBeVisible();

  const grid = page.locator(".osionos-layout-grid");
  await expect(grid.locator(".osionos-layout-cell")).toHaveCount(2);
  await expect(grid).toContainText("We build the editor.");
  await expect(grid).toContainText("Shipped on Friday.");
  await expect(page.getByText("Unreleased notes.")).toHaveCount(0);
});
