/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   graph-engine-audit.spec.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Accessibility + performance audit of the flagged graph view (no extra deps).
// a11y: every interactive control in the explorer must expose an accessible name
// (the most common WCAG 2.1 failure — buttons/inputs without names), and the
// canvas must be labeled. perf: sample real rAF frame timing to back the
// "ultra fast" claim. Skips unless VITE_GRAPH_ENGINE_V2=true (CI-safe).

import { expect, test } from "@playwright/test";

async function openGraph(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("osionos.home.variant", "graph");
    } catch {
      /* ignore */
    }
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const canvas = page.locator("canvas.osio-graph__fg");
  const active = await canvas
    .waitFor({ state: "visible", timeout: 12_000 })
    .then(() => true)
    .catch(() => false);
  return { canvas, active };
}

test("a11y: every interactive control has an accessible name", async ({ page }) => {
  const { active } = await openGraph(page);
  test.skip(!active, "graph-engine view inactive (set VITE_GRAPH_ENGINE_V2=true)");
  await page.waitForTimeout(1500);

  const issues = await page.evaluate(() => {
    const problems = [];
    const root = document.querySelector(".osio-graph-explorer") ?? document.body;
    const accessibleName = (el) => {
      const aria = el.getAttribute("aria-label");
      if (aria && aria.trim()) return aria.trim();
      const title = el.getAttribute("title");
      if (title && title.trim()) return title.trim();
      if (el.labels && el.labels.length) {
        const text = [...el.labels].map((l) => l.textContent ?? "").join(" ").trim();
        if (text) return text;
      }
      return (el.textContent ?? "").trim();
    };
    for (const el of root.querySelectorAll('button, input, a[href], [role="tab"]')) {
      if (!accessibleName(el)) problems.push(el.outerHTML.slice(0, 90));
    }
    const fg = document.querySelector("canvas.osio-graph__fg");
    if (fg && !fg.getAttribute("aria-label")) problems.push("canvas.osio-graph__fg missing aria-label");
    return problems;
  });

  expect(issues, `unnamed interactive elements:\n${issues.join("\n")}`).toEqual([]);
});

test("perf: live frame timing stays smooth", async ({ page }) => {
  const { active } = await openGraph(page);
  test.skip(!active, "graph-engine view inactive (set VITE_GRAPH_ENGINE_V2=true)");
  await page.waitForTimeout(1500);

  const stats = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const deltas = [];
        let last = performance.now();
        let frames = 0;
        const tick = (now) => {
          deltas.push(now - last);
          last = now;
          frames += 1;
          if (frames < 120) requestAnimationFrame(tick);
          else {
            const sorted = [...deltas].sort((a, b) => a - b);
            resolve({
              avgMs: deltas.reduce((s, d) => s + d, 0) / deltas.length,
              p95Ms: sorted[Math.floor(sorted.length * 0.95)],
              frames,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
  );

  console.log(`[graph-engine perf] avg=${stats.avgMs.toFixed(1)}ms p95=${stats.p95Ms.toFixed(1)}ms over ${stats.frames} frames`);
  // Loose bound for headless containers; mainly records real numbers.
  expect(stats.avgMs).toBeLessThan(45);
});
