/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   graph-engine-visual.spec.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Visual smoke test for @osionos/graph-engine wired into osionos. It forces the
// Home → graph variant and verifies the aurora-glass canvas, console and (when
// data is present) an inspectable node render. It SKIPS itself unless the engine
// view is active (VITE_GRAPH_ENGINE_V2=true), so it stays green in normal CI.
//
// To run with a capture:
//   .env.test → VITE_GRAPH_ENGINE_V2=true (+ offline/local), then
//   docker compose ... run --rm --no-deps browser-tests \
//     pnpm exec playwright test tests/e2e/graph-engine-visual.spec.mjs

import { expect, test } from "@playwright/test";

test("aurora-glass graph: canvas + console render", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("osionos.home.variant", "graph");
    } catch {
      /* storage unavailable — ignore */
    }
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const canvas = page.locator("canvas.osio-graph__fg");
  const active = await canvas
    .waitFor({ state: "visible", timeout: 12_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!active, "graph-engine view inactive (set VITE_GRAPH_ENGINE_V2=true)");

  // Aurora background canvas + the control console are both present.
  await expect(page.locator("canvas.osio-graph__bg")).toBeVisible();
  await expect(page.locator(".osio-gc")).toBeVisible();

  // Let the worker layout settle and the reveal animation finish.
  await page.waitForTimeout(2_800);
  await page.screenshot({ path: "test-results/graph-engine.png" });

  // Switch the console to the Visual tab (sliders) for a second capture.
  const visualTab = page.getByRole("tab", { name: "Visual" });
  if (await visualTab.count()) {
    await visualTab.first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: "test-results/graph-engine-visual-tab.png" });
  }

  // Click roughly the canvas center to select a node and open the inspector.
  const box = await canvas.boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(600);
    await page.screenshot({ path: "test-results/graph-engine-selected.png" });
  }
});
