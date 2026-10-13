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

// Legacy page tree (the sidebar with the workbench flag OFF): expand a page holding 500 child
// pages -> its last row painted. The children are created through the page store in one
// setState (window.__perfSeedFolder, dev-server only); the sidebar's own create action would be
// 500 async addPage round trips. With the flag ON the Files panel is the VFS explorer, which
// this spec does not measure; this case stays the legacy baseline until P3 deletes the tree.

import { test } from "@playwright/test";

import { PERF_USE, assertBudget, bootApp, measureFloor, measureToPaint } from "./perfHarness.mjs";

test.use(PERF_USE);

const CHILDREN = 500;
const LAST_TITLE = `file-${String(CHILDREN - 1).padStart(4, "0")}.ts`;

// Measured 2026-10-13, flag OFF, tracing off, two runs while other gates shared the host:
// median 1203-1291 ms, p95 3077-3826 ms (floor 31 ms). Target 50 missed -> budget = 3826 x 1.2
// = 4600. Earlier numbers (median 968 ms) were the flag-ON sidebar with tracing on. The legacy
// tree renders all 500 rows; P3 deletes it, and the VFS explorer gets its own case.
test("legacy page tree: expand folder with 500 children, workbench OFF", async ({ page }) => {
  test.setTimeout(180_000);
  await bootApp(page, { workbench: false });
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
  assertBudget("explorerExpand", "expand500", stats, { target: 50, budget: 4600 }, { floor, children: CHILDREN });
});
