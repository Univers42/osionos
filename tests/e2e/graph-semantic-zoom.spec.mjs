/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   graph-semantic-zoom.spec.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Semantic-zoom screenshot matrix: light + dark theme × far / mid / close
// zoom, on the deterministic ?graphBench synthetic model. Captures land in
// test-results/graph-{theme}-{stage}.png for visual review. SKIPS itself when
// the graph view is inactive (same guard as graph-engine-visual.spec.mjs).
// Headless containers may render emoji as tofu — cosmetic only.

import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  test(`semantic zoom stages render (${theme})`, async ({ page }) => {
    await page.addInitScript((mode) => {
      try {
        localStorage.setItem("osionos.home.variant", "graph");
        localStorage.setItem("osionos:theme-mode", mode);
      } catch {
        /* storage unavailable — ignore */
      }
    }, theme);
    await page.goto("/?home=graph&graphBench=400", { waitUntil: "domcontentloaded" });

    const canvas = page.locator("canvas.osio-graph__fg");
    const active = await canvas
      .waitFor({ state: "visible", timeout: 12_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!active, "graph view inactive");

    await page.waitForTimeout(3_500); // worker layout + reveal settle
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);

    // MID: the default fit view (icons within dots once scale crosses the band).
    await page.screenshot({ path: `test-results/graph-${theme}-mid.png` });

    // FAR: zoom out — clean constellation dots.
    for (let i = 0; i < 10; i += 1) await page.mouse.wheel(0, 240);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `test-results/graph-${theme}-far.png` });

    // CLOSE: zoom in hard — glass cards with icon, title, status, link count.
    for (let i = 0; i < 26; i += 1) await page.mouse.wheel(0, -240);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `test-results/graph-${theme}-close.png` });
  });
}
