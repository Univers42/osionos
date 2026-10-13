// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   explorerExpand.spec.mjs                            :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// Explorer (the workbench's Files panel = the page tree): expand a page holding 500 child
// pages -> its last row painted. The children are created through the page store in one
// setState (window.__perfSeedFolder, dev-server only); the sidebar's own create action would be
// 500 async addPage round trips. The VFS WorkspaceExplorer (panels/ExplorerPanel.tsx) is not
// mounted by anything on this branch, so it is not measurable yet.

import { test } from "@playwright/test";

import { assertBudget, bootApp, measureFloor, measureToPaint } from "./perfHarness.mjs";

const CHILDREN = 500;
const LAST_TITLE = `file-${String(CHILDREN - 1).padStart(4, "0")}.ts`;

// Measured 2026-10-13: median 968 ms, p95 1341-1633 ms, max 1601 ms (floor 22 ms). Target 50 missed ->
// budget = worst observed p95 (1633 over two runs) x 1.2 = 1960. Dominated by React's dev-build
// render of 500 PageTreeItem rows (CDP profile: ~50% native "(program)" = DOM/layout, ~10%
// visitNode, ~5% jsxDEV element creation, 4% GC).
test("explorer expand folder with 500 children, workbench ON", async ({ page }) => {
  test.setTimeout(180_000);
  await bootApp(page, { workbench: true });
  await page.locator("[data-osio-workbench]").waitFor({ state: "visible", timeout: 60_000 });
  const floor = await measureFloor(page);
  await page.evaluate((n) => globalThis.__perfSeedFolder(n), CHILDREN);
  const chevron = page.getByRole("button", { name: "Expand perf-folder", exact: true });
  await chevron.waitFor({ state: "visible", timeout: 20_000 });
  const lastRow = page.locator("span.truncate", { hasText: LAST_TITLE });
  const stats = await measureToPaint(page, () => chevron.click(), {
    startEvent: "click",
    until: { selector: "span.truncate", text: LAST_TITLE },
    before: async () => {
      if (await lastRow.count()) {
        await page.getByRole("button", { name: "Collapse perf-folder", exact: true }).click();
        await lastRow.waitFor({ state: "detached" });
      }
    },
  });
  assertBudget("explorerExpand", "expand500", stats, { target: 50, budget: 1960 }, { floor, children: CHILDREN });
});
