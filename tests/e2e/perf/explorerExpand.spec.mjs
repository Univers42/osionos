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

// Explorer (the workbench's only tree): expand a folder holding 500 children -> its first child
// row painted. __perfSeedFolder (dev-server only) creates "perf-folder" with file-0000.ts ..
// file-0499.ts in one setState. The explorer list is virtualised, so the LAST child is never
// mounted: the first one is the paint that proves the expansion rendered. `before` collapses the
// folder again so every sample measures a real expansion.

import { test } from "@playwright/test";

import { PERF_USE, assertBudget, bootApp, measureFloor, measureToPaint } from "./perfHarness.mjs";
import { explorerRow } from "../../browser/core/app.mjs";

test.use(PERF_USE);

const CHILDREN = 500;
const FIRST_TITLE = `file-${String(0).padStart(4, "0")}.ts`;

// Measured 2026-10-13 (Docker, tracing off, n=30, three runs): median 31.2-31.5 ms, p95 37.0 /
// 38.4 / 39.2 ms (floor median 29.9-30.8) -> PASS against target 50, so budget = target.
test("explorer: expand folder with 500 children", async ({ page }) => {
  test.setTimeout(180_000);
  await bootApp(page);
  const floor = await measureFloor(page);
  await page.evaluate((n) => globalThis.__perfSeedFolder(n), CHILDREN);
  const folderRow = explorerRow(page, "perf-folder");
  const firstRow = page.locator(".truncate", { hasText: FIRST_TITLE });
  const stats = await measureToPaint(page, () => folderRow.click(), {
    startEvent: "click",
    until: { selector: ".truncate", text: FIRST_TITLE },
    before: async () => {
      if (await firstRow.count()) {
        await folderRow.click();
        await firstRow.waitFor({ state: "detached" });
      }
    },
  });
  assertBudget("explorerExpand", "expand500", stats, { target: 50, budget: 50 }, { floor, children: CHILDREN });
});
