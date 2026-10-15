/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pane-resize-bench.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Splitter-drag responsiveness benchmark for the workspace grid.
//
//   node scripts/pane-resize-bench.mjs [baseUrl] [--panes=12] [--cpu=1]
//
// Builds a 12-pane (3 rows x 4 cols) grid of a REAL seeded page through the pane
// header's Split down / Split right buttons, then drags a vertical splitter back and
// forth with true pointer events while sampling requestAnimationFrame deltas. Reports avg
// FPS, p95 frame time, and dropped-frame share during the drag — run it
// against a `vite preview` build before/after a change to compare.

import { chromium } from "playwright";

function parseArgs(argv) {
  const base = (argv.find((a) => /^https?:\/\//.test(a)) ?? process.env.LH_URL ?? "http://127.0.0.1:4173").replace(/\/$/, "");
  const panes = Number(argv.find((a) => a.startsWith("--panes="))?.slice(8) ?? 12);
  const cpu = Number(argv.find((a) => a.startsWith("--cpu="))?.slice(6) ?? 1);
  const tab = argv.find((a) => a.startsWith("--tab="))?.slice(6) ?? "page";
  return { base, panes, cpu, tab };
}

/** Widest pane of grid row `row` (panes grouped by their top edge; a tie goes left), so
 *  splitting it each time leaves equal columns. */
async function widestPaneInRow(page, row) {
  const index = await page.$$eval("[data-osio-pane]", (els, r) => {
    const boxes = els.map((el, i) => { const b = el.getBoundingClientRect(); return { i, top: Math.round(b.top), left: b.left, width: Math.round(b.width) }; });
    const tops = [...new Set(boxes.map((b) => b.top))].sort((a, b) => a - b);
    return boxes.filter((b) => b.top === tops[r]).sort((a, b) => b.width - a.width || a.left - b.left)[0].i;
  }, row);
  return page.locator("[data-osio-pane]").nth(index);
}

// The app persists a layout only for a signed-in user (layoutPersist.ts layoutScope), so the
// offline build is given its grid the way a user builds one: rows first, then each row split
// right. A split copies the active tab, so every pane shows the page the first one showed.
async function buildGrid(page, paneCount) {
  const cols = Math.min(4, paneCount);
  const rows = Math.ceil(paneCount / cols);
  for (let r = 1; r < rows; r++) await page.locator('button[title="Split down"]').first().click();
  for (let r = 0; r < rows; r++) {
    for (let c = 1; c < cols; c++) await (await widestPaneInRow(page, r)).locator('button[title="Split right"]').click();
  }
}

/** Widths of the first grid row's panes, in px — what a drag must change. */
const firstRowWidths = (page) => page.$$eval("[data-osio-pane]", (els) => {
  const boxes = els.map((el) => el.getBoundingClientRect());
  const top = Math.min(...boxes.map((b) => Math.round(b.top)));
  return boxes.filter((b) => Math.round(b.top) === top).sort((a, b) => a.left - b.left).map((b) => Math.round(b.width));
});

async function main() {
  const { base, panes, cpu, tab } = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();

  // Seed visit: offline mode creates the workspace + pages; the heaviest page the Explorer
  // shows (the active workspace's) is the one every pane opens.
  await page.goto(`${base}/`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith("osio:pages:")), { timeout: 25000 }).catch(() => {});
  await page.getByRole("treeitem").first().waitFor({ timeout: 25000 });
  const pick = await page.evaluate(() => {
    const blocksByTitle = new Map();
    for (const key of Object.keys(localStorage).filter((k) => k.startsWith("osio:pages:"))) {
      try {
        for (const p of JSON.parse(localStorage.getItem(key) || "[]")) {
          if (!p.archivedAt && p.surface !== "folder" && p.title) blocksByTitle.set(p.title, Math.max(blocksByTitle.get(p.title) ?? 0, JSON.stringify(p.content ?? []).length));
        }
      } catch { /* not a page list */ }
    }
    const rows = [...document.querySelectorAll('[role="treeitem"]')].map((el, index) => ({ index, text: el.textContent.trim() }));
    let best = null;
    for (const row of rows) for (const [title, size] of blocksByTitle) {
      if (row.text.endsWith(title) && (!best || size > best.size)) best = { index: row.index, title, size };
    }
    return best;
  });
  console.error(`[bench] page="${pick?.title ?? ""}" (${pick?.size ?? 0} bytes of content) panes=${panes} cpu=${cpu}x tab=${tab}`);
  if (tab !== "home") {
    if (!pick) { console.error("[bench] the Explorer shows no seeded page to open"); process.exit(1); }
    await page.getByRole("treeitem").nth(pick.index).click();
    await page.waitForTimeout(1500);
  }
  await buildGrid(page, panes);
  if (cpu > 1) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  }
  await page.waitForTimeout(6000); // let all panes hydrate

  // data-pane-splitter distinguishes the grid dividers from the database
  // tables' own column-resize separators (also role="separator").
  const splitters = page.locator('[data-pane-splitter="row"]');
  const splitterCount = await splitters.count();
  const handle = splitters.first();
  const box = await handle.boundingBox();
  if (!box) { console.error("[bench] no splitter found"); process.exit(1); }
  const paneCount = await page.locator("[data-osio-pane]").count();
  if (paneCount !== panes) { console.error(`[bench] built ${paneCount} panes, wanted ${panes}`); process.exit(1); }
  const widthsBefore = await firstRowWidths(page);
  console.error(`[bench] panes=${paneCount} splitters=${splitterCount} firstRowWidths=${JSON.stringify(widthsBefore)}`);

  // Frame sampler: rAF deltas + long tasks, started right before the drag.
  await page.evaluate(() => {
    const s = { deltas: [], long: 0, running: true, last: 0 };
    globalThis.__frames = s;
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { s.long += e.duration; })).observe({ type: "longtask" }); } catch { /* */ }
    const tick = (t) => { if (s.last) s.deltas.push(t - s.last); s.last = t; if (s.running) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });

  // Drag: grab the first vertical splitter, sweep right then left then right
  // (~3s total, 40px steps) with real pointer events.
  const idleOnly = process.argv.includes("--idle");
  if (idleOnly) {
    await page.waitForTimeout(3000); // sample ambient frames, no interaction
  } else {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    let x = cx;
    // Net-positive sweep so the committed sizes provably differ from the start.
    for (const [dir, distance] of [[1, 240], [-1, 320], [1, 240]]) {
      for (let moved = 0; moved < distance; moved += 8) {
        x += dir * 8;
        await page.mouse.move(x, cy, { steps: 1 });
        await page.waitForTimeout(8);
      }
    }
    await page.mouse.up();
  }

  const widthsAfter = await firstRowWidths(page);
  const moved = JSON.stringify(widthsBefore) !== JSON.stringify(widthsAfter);
  console.error(`[bench] resize ${moved ? "APPLIED" : "DID NOT APPLY"} firstRowWidths=${JSON.stringify(widthsAfter)}`);

  const stats = await page.evaluate(() => { const s = globalThis.__frames; s.running = false; return { deltas: s.deltas, long: s.long }; });
  const d = stats.deltas.filter((x) => x > 0);
  d.sort((a, b) => a - b);
  const sum = d.reduce((a, b) => a + b, 0);
  const avg = sum / d.length;
  const p95 = d[Math.floor(d.length * 0.95)] ?? 0;
  const worst = d[d.length - 1] ?? 0;
  const dropped = d.filter((x) => x > 33.4).length;
  console.log(`frames=${d.length} avgFrame=${avg.toFixed(1)}ms (${(1000 / avg).toFixed(0)} FPS) p95=${p95.toFixed(1)}ms worst=${worst.toFixed(0)}ms dropped>33ms=${dropped} (${((dropped / d.length) * 100).toFixed(0)}%) longTask=${stats.long.toFixed(0)}ms`);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
