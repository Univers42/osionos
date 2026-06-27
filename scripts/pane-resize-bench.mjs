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
// Seeds a 12-pane (3 rows x 4 cols) layout of REAL seeded pages into
// localStorage, then drags a vertical splitter back and forth with true
// pointer events while sampling requestAnimationFrame deltas. Reports avg
// FPS, p95 frame time, and dropped-frame share during the drag — run it
// against a `vite preview` build before/after a change to compare.

import { chromium } from "playwright";

const rid = () => Math.random().toString(36).slice(2, 9);
const pageTab = (pid, ws) => ({ tabId: `tab-${rid()}`, pageId: pid, workspaceId: ws, kind: "page", title: "Page", icon: "icon:doc" });
const pane = (tab) => ({ type: "pane", id: `pane-${rid()}`, tabs: [tab], activeTabId: tab.tabId });

function parseArgs(argv) {
  const base = (argv.find((a) => /^https?:\/\//.test(a)) ?? process.env.LH_URL ?? "http://127.0.0.1:4173").replace(/\/$/, "");
  const panes = Number(argv.find((a) => a.startsWith("--panes="))?.slice(8) ?? 12);
  const cpu = Number(argv.find((a) => a.startsWith("--cpu="))?.slice(6) ?? 1);
  const tab = argv.find((a) => a.startsWith("--tab="))?.slice(6) ?? "page";
  return { base, panes, cpu, tab };
}

const homeTab = () => ({ tabId: `tab-${rid()}`, pageId: "__home__", workspaceId: "", kind: "home", title: "Home", icon: "icon:home" });

/** rows x cols nested split tree (column of row-splits), like a real heavy workspace. */
function gridLayout(pid, ws, paneCount, tabKind) {
  const cell = () => (tabKind === "home" ? pane(homeTab()) : pane(pageTab(pid, ws)));
  const cols = Math.min(4, paneCount);
  const rows = Math.ceil(paneCount / cols);
  const rowNodes = Array.from({ length: rows }, () => {
    const cells = Array.from({ length: cols }, cell);
    return { type: "split", id: `split-${rid()}`, direction: "row", children: cells, sizes: cells.map(() => 100 / cols) };
  });
  const root = rows === 1 ? rowNodes[0] : { type: "split", id: `split-${rid()}`, direction: "column", children: rowNodes, sizes: rowNodes.map(() => 100 / rows) };
  return { root, activePaneId: rowNodes[0].children?.[0]?.id ?? rowNodes[0].id };
}

async function main() {
  const { base, panes, cpu, tab } = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();

  // Seed visit: let offline mode create the workspace + pages, grab a real page id.
  await page.goto(`${base}/`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith("osio:pages:")), { timeout: 25000 }).catch(() => {});
  const { ws, pid, blocks } = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("osio:pages:"));
    let p = ""; let n = 0;
    try {
      const a = JSON.parse(localStorage.getItem(key) || "[]");
      // heaviest page = most serialized content
      const best = a.filter((x) => !x.archivedAt && x.surface !== "folder")
        .sort((l, r) => JSON.stringify(r.content ?? []).length - JSON.stringify(l.content ?? []).length)[0];
      p = best?._id || ""; n = best?.content?.length ?? 0;
    } catch { /* */ }
    return { ws: key ? key.slice("osio:pages:".length) : "", pid: p, blocks: n };
  });
  console.error(`[bench] seeded ws=${ws || "?"} page=${pid || "(none)"} (${blocks} blocks) panes=${panes} cpu=${cpu}x tab=${tab}`);

  await page.evaluate(({ k, v }) => localStorage.setItem(k, v), {
    k: "osionos.workspace.layout.v1", v: JSON.stringify(gridLayout(pid, ws, panes, tab)),
  });
  if (cpu > 1) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  }
  await page.goto(`${base}/`, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(6000); // let all panes hydrate

  // data-pane-splitter distinguishes the grid dividers from the database
  // tables' own column-resize separators (also role="separator").
  const splitters = page.locator('[data-pane-splitter="row"]');
  const splitterCount = await splitters.count();
  const handle = splitters.first();
  const box = await handle.boundingBox();
  if (!box) { console.error("[bench] no splitter found"); process.exit(1); }
  const sizesBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("osionos.workspace.layout.v1") || "{}")?.root?.children?.[0]?.sizes ?? null);
  console.error(`[bench] splitters=${splitterCount} firstRowSizes=${JSON.stringify(sizesBefore)}`);

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

  const sizesAfter = await page.evaluate(() => JSON.parse(localStorage.getItem("osionos.workspace.layout.v1") || "{}")?.root?.children?.[0]?.sizes ?? null);
  const moved = JSON.stringify(sizesBefore) !== JSON.stringify(sizesAfter);
  console.error(`[bench] resize ${moved ? "APPLIED" : "DID NOT APPLY"} firstRowSizes=${JSON.stringify(sizesAfter?.map((n) => Math.round(n)))}`);

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
