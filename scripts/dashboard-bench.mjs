/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dashboard-bench.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Dashboard-view benchmark (Notion-model widgets over the database surface).
//
//   node scripts/dashboard-bench.mjs [baseUrl] [--widgets=8] [--cpu=1] [--assert]
//
// Builds a real dashboard through the UI on ?home=database (existing table
// view + new chart/gallery/list widgets), then samples requestAnimationFrame
// deltas in three stages: idle, widget-splitter drag, and row-height drag.
// Thresholds (--assert): drag avg ≥ 55 FPS and dropped ≤ 10% at --cpu=1,
// avg ≥ 30 FPS at --cpu=4. Run against `vite preview` for honest numbers.

import { chromium } from "playwright";

function parseArgs(argv) {
  const base = (argv.find((a) => /^https?:\/\//.test(a)) ?? process.env.LH_URL ?? "http://127.0.0.1:4173").replace(/\/$/, "");
  const widgets = Math.min(12, Number(argv.find((a) => a.startsWith("--widgets="))?.slice(10) ?? 8));
  const cpu = Number(argv.find((a) => a.startsWith("--cpu="))?.slice(6) ?? 1);
  const assert = argv.includes("--assert");
  return { base, widgets, cpu, assert };
}

async function buildDashboard(page, widgets) {
  await page.locator('[aria-label="Add view"]').first().click();
  await page.getByRole("button", { name: "Dashboard", exact: true }).first().click();
  await page.getByRole("button", { name: /Customize layout/ }).click();
  await page.getByRole("button", { name: /Add your first widget/ }).click();
  await page.locator('button:below(:text("Existing views"))').first().click();
  const newTypes = ["Chart", "Gallery", "List", "Table"];
  for (let i = 1; i < widgets; i++) {
    await page.getByRole("button", { name: /Add widget/ }).click();
    await page.getByText("New view").waitFor();
    await page.locator('button:below(:text("New view"))', { hasText: newTypes[i % newTypes.length] }).first().click();
  }
  await page.getByText(`${widgets}/12 widgets`).waitFor();
}

async function sample(page, run) {
  await page.evaluate(() => {
    const s = { deltas: [], long: 0, running: true, last: 0 };
    globalThis.__frames = s;
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { s.long += e.duration; })).observe({ type: "longtask" }); } catch { /* */ }
    const tick = (t) => { if (s.last) s.deltas.push(t - s.last); s.last = t; if (s.running) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await run();
  const stats = await page.evaluate(() => { const s = globalThis.__frames; s.running = false; return { deltas: s.deltas, long: s.long }; });
  const d = stats.deltas.filter((x) => x > 0).sort((a, b) => a - b);
  const avg = d.reduce((a, b) => a + b, 0) / Math.max(1, d.length);
  const p95 = d[Math.floor(d.length * 0.95)] ?? 0;
  const dropped = d.filter((x) => x > 33.4).length;
  return { frames: d.length, avgMs: avg, fps: 1000 / avg, p95Ms: p95, droppedPct: (dropped / Math.max(1, d.length)) * 100, longMs: stats.long };
}

async function dragSweep(page, box, horizontal) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  let pos = horizontal ? cx : cy;
  for (const [dir, distance] of [[1, 200], [-1, 280], [1, 200]]) {
    for (let moved = 0; moved < distance; moved += 8) {
      pos += dir * 8;
      await (horizontal ? page.mouse.move(pos, cy, { steps: 1 }) : page.mouse.move(cx, pos, { steps: 1 }));
      await page.waitForTimeout(8);
    }
  }
  await page.mouse.up();
}

function report(name, s) {
  console.log(`${name}: frames=${s.frames} avg=${s.avgMs.toFixed(1)}ms (${s.fps.toFixed(0)} FPS) p95=${s.p95Ms.toFixed(1)}ms dropped>33ms=${s.droppedPct.toFixed(0)}% longTask=${s.longMs.toFixed(0)}ms`);
}

async function main() {
  const { base, widgets, cpu, assert } = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  if (cpu > 1) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  }

  const t0 = Date.now();
  await page.goto(`${base}/?home=database`, { waitUntil: "load", timeout: 60000 });
  await page.locator('[aria-label="Add view"]').first().waitFor({ timeout: 30000 });
  const ttiMs = Date.now() - t0;
  console.error(`[bench] database surface interactive in ${ttiMs}ms; building ${widgets}-widget dashboard (cpu=${cpu}x)`);
  await buildDashboard(page, widgets);
  await page.waitForTimeout(1500); // let widgets hydrate (chart chunk, etc.)

  const idle = await sample(page, () => page.waitForTimeout(2000));

  const colSplitter = page.locator('[data-dashboard-splitter="col"]').first();
  const colBox = await colSplitter.boundingBox();
  if (!colBox) { console.error("[bench] no widget splitter found"); process.exit(1); }
  const drag = await sample(page, () => dragSweep(page, colBox, true));

  const rowSplitter = page.locator('[data-dashboard-splitter="row"]').first();
  const rowBox = await rowSplitter.boundingBox();
  const rowDrag = rowBox ? await sample(page, () => dragSweep(page, rowBox, false)) : null;

  console.log(`tti=${ttiMs}ms widgets=${widgets} cpu=${cpu}x`);
  report("idle ", idle);
  report("drag ", drag);
  if (rowDrag) report("hdrag", rowDrag);

  let pass = true;
  if (cpu <= 1) pass = drag.fps >= 55 && drag.droppedPct <= 10;
  else pass = drag.fps >= 30;
  console.log(`threshold ${pass ? "PASS" : "FAIL"} (drag ${drag.fps.toFixed(0)} FPS @ cpu=${cpu}x)`);
  await browser.close();
  if (assert && !pass) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
