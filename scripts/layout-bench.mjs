/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layout-bench.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Layout block (`/layout`) interaction benchmark.
//
//   node scripts/layout-bench.mjs [baseUrl] [--cells=24] [--v2=0|1] [--cpu=1]
//                                 [--stage=all|mount|move|resize|type|settings] [--json]
//
// Seeds a deterministic page holding one layout block with N cells straight
// into the offline-mode localStorage cache, opens it in a single pane, and
// measures: cold mount, move-drag FPS, resize-drag FPS, typing latency, and
// settings-change cost. `--v2=1` flips the osio.canvas.v2 flag so the SAME
// seed benches legacy vs Canvas V2. Run against a `vite preview` build —
// dev-server numbers are meaningless.

import { spawn } from "node:child_process";

import { chromium } from "playwright";

const rid = () => Math.random().toString(36).slice(2, 9);
const pageTab = (pid, ws) => ({ tabId: `tab-${rid()}`, pageId: pid, workspaceId: ws, kind: "page", title: "Layout bench", icon: "icon:doc" });
const pane = (tab) => ({ type: "pane", id: `pane-${rid()}`, tabs: [tab], activeTabId: tab.tabId });

function parseArgs(argv) {
  const base = (argv.find((a) => /^https?:\/\//.test(a)) ?? process.env.LH_URL ?? "http://127.0.0.1:4173").replace(/\/$/, "");
  const cells = Number(argv.find((a) => a.startsWith("--cells="))?.slice(8) ?? 24);
  const cpu = Number(argv.find((a) => a.startsWith("--cpu="))?.slice(6) ?? 1);
  const v2 = (argv.find((a) => a.startsWith("--v2="))?.slice(5) ?? "0") === "1";
  const stage = argv.find((a) => a.startsWith("--stage="))?.slice(8) ?? "all";
  const json = argv.includes("--json");
  return { base, cells, cpu, v2, stage, json };
}

/** Deterministic layout page: N cells on a 12-col grid, 4 per row, every 6th auto-height. */
function buildLayoutPage(ws, cellCount) {
  const layoutCells = Array.from({ length: cellCount }, (_, i) => ({
    id: `bench-cell-${i}`,
    colStart: (i % 4) * 3 + 1,
    colSpan: 3,
    rowStart: Math.floor(i / 4) * 2 + 1,
    rowSpan: 2,
    type: "text",
    content: "",
    ...(i % 6 === 5 ? { sizing: "auto-height", verticalConstraint: "hug" } : {}),
    blocks: [
      { id: `bench-block-${i}a`, type: "heading_3", content: `Cell ${i}` },
      { id: `bench-block-${i}b`, type: "paragraph", content: `Bench cell ${i} — lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.` },
    ],
  }));
  return {
    _id: "bench-layout-page",
    title: "Layout bench",
    workspaceId: ws,
    surface: "page",
    updatedAt: new Date().toISOString(),
    content: [{
      id: "bench-layout-block",
      type: "layout",
      content: "",
      layoutMode: "inline",
      layoutConfig: { columns: 12, rows: 8, rowHeight: 96, gap: 16, wrap: true, autoArrange: false, snapToGrid: true, guideVisibility: "auto", preview: false },
      layoutCells,
    }],
  };
}

async function startSampler(page) {
  await page.evaluate(() => {
    const s = { deltas: [], long: 0, running: true, last: 0 };
    globalThis.__frames = s;
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { s.long += e.duration; })).observe({ type: "longtask" }); } catch { /* */ }
    const tick = (t) => { if (s.last) s.deltas.push(t - s.last); s.last = t; if (s.running) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}

async function stopSampler(page) {
  const stats = await page.evaluate(() => { const s = globalThis.__frames; s.running = false; return { deltas: s.deltas, long: s.long }; });
  const d = stats.deltas.filter((x) => x > 0).sort((a, b) => a - b);
  if (d.length === 0) return { frames: 0, avgMs: 0, fps: 0, p95Ms: 0, worstMs: 0, droppedPct: 0, longTaskMs: stats.long };
  const avg = d.reduce((a, b) => a + b, 0) / d.length;
  return {
    frames: d.length,
    avgMs: Number(avg.toFixed(1)),
    fps: Number((1000 / avg).toFixed(0)),
    p95Ms: Number((d[Math.floor(d.length * 0.95)] ?? 0).toFixed(1)),
    worstMs: Number((d[d.length - 1] ?? 0).toFixed(0)),
    droppedPct: Number(((d.filter((x) => x > 33.4).length / d.length) * 100).toFixed(0)),
    longTaskMs: Number(stats.long.toFixed(0)),
  };
}

/** Net-zero horizontal pointer sweep on a handle (returns the cell roughly to its start). */
async function sweep(page, locator, axis = "x") {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`sweep: no bounding box for ${locator}`);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  let pos = axis === "x" ? cx : cy;
  let applied = false;
  for (const [dir, distance] of [[1, 160], [-1, 200], [1, 40]]) {
    for (let moved = 0; moved < distance; moved += 8) {
      pos += dir * 8;
      await (axis === "x" ? page.mouse.move(pos, cy, { steps: 1 }) : page.mouse.move(cx, pos, { steps: 1 }));
      await page.waitForTimeout(8);
    }
    if (!applied) {
      applied = await page.evaluate(() => Boolean(document.querySelector(
        '[data-layout-cell-moving="true"], [data-layout-cell-resizing="true"], [data-layout-interacting="true"]',
      )));
    }
  }
  await page.mouse.up();
  return applied;
}

/** Start `vite preview` for the dist build when the target URL is not already served. */
async function ensureServer(base) {
  const alive = await fetch(base, { signal: AbortSignal.timeout(2000) }).then(() => true).catch(() => false);
  if (alive) return null;
  const port = new URL(base).port || "4173";
  console.error(`[bench] ${base} unreachable — starting vite preview on :${port}`);
  const child = spawn("pnpm", ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", port, "--strictPort"], {
    cwd: new URL("..", import.meta.url).pathname,
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; i < 60; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (await fetch(base, { signal: AbortSignal.timeout(1000) }).then(() => true).catch(() => false)) return child;
  }
  child.kill("SIGTERM");
  throw new Error(`vite preview did not become reachable at ${base} — run \`bash scripts/docker-run.sh build\` first`);
}

async function main() {
  const { base, cells, cpu, v2, stage, json } = parseArgs(process.argv.slice(2));
  const impl = v2 ? "v2" : "legacy";
  const server = await ensureServer(base);
  const want = (name) => stage === "all" || stage === name;
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  // Explicit value either way: a stale flag in the profile must not skew the legacy run.
  await ctx.addInitScript((flag) => localStorage.setItem("osio.canvas.v2", flag), v2 ? "1" : "0");
  // Long tasks are observer-only (getEntriesByType returns nothing) — buffer them from t=0.
  await ctx.addInitScript(() => {
    globalThis.__mountLong = 0;
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => { globalThis.__mountLong += e.duration; }))
        .observe({ type: "longtask", buffered: true });
    } catch { /* */ }
  });

  // Seed visit: offline mode creates the workspace, then inject the bench page.
  await page.goto(`${base}/`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith("osio:pages:")), { timeout: 25000 });
  const ws = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("osio:pages:"));
    return key ? key.slice("osio:pages:".length) : "";
  });
  if (!ws) { console.error("[bench] no offline workspace found — build with VITE_ALLOW_OFFLINE_MODE=true"); process.exit(1); }
  await page.evaluate(({ key, entry, layoutKey, layout }) => {
    const pages = JSON.parse(localStorage.getItem(key) || "[]").filter((p) => p._id !== entry._id);
    pages.push(entry);
    localStorage.setItem(key, JSON.stringify(pages));
    localStorage.setItem(layoutKey, JSON.stringify(layout));
  }, {
    key: `osio:pages:${ws}`,
    entry: buildLayoutPage(ws, cells),
    layoutKey: "osionos.workspace.layout.v1",
    layout: (() => { const p = pane(pageTab("bench-layout-page", ws)); return { root: p, activePaneId: p.id }; })(),
  });
  console.error(`[bench] impl=${impl} cells=${cells} cpu=${cpu}x ws=${ws}`);

  if (cpu > 1) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  }

  const results = [];
  const record = (name, data) => { results.push({ stage: name, impl, cells, cpu, ...data }); };

  // ---- mount: navigation start → every cell shell attached ----------------
  const mountStart = Date.now();
  await page.goto(`${base}/`, { waitUntil: "load", timeout: 60000 });
  await page.waitForSelector(`.osionos-layout-cell >> nth=${cells - 1}`, { timeout: 30000 });
  const mountMs = Date.now() - mountStart;
  const mountLong = await page.evaluate(() => globalThis.__mountLong ?? 0);
  if (want("mount")) record("mount", { wallMs: mountMs, longTaskMs: Number(mountLong.toFixed(0)) });
  await page.waitForTimeout(2500); // hydration settle before gesture stages

  const cell = page.locator('[data-layout-cell-id="bench-cell-0"]');
  await cell.scrollIntoViewIfNeeded();

  // ---- move: drag the cell grip in a net-zero sweep ------------------------
  if (want("move")) {
    await cell.hover();
    await startSampler(page);
    const applied = await sweep(page, cell.locator(".osionos-layout-cell-drag").first(), "x");
    record("move", { ...(await stopSampler(page)), applied });
    await page.waitForTimeout(400);
  }

  // ---- resize: drag the right edge handle in a net-zero sweep --------------
  if (want("resize")) {
    await cell.hover();
    await startSampler(page);
    const applied = await sweep(page, cell.locator(".osionos-layout-resize-hit--right").first(), "x");
    record("resize", { ...(await stopSampler(page)), applied });
    await page.waitForTimeout(400);
  }

  // ---- type: keydown → next-frame latency inside a cell editor -------------
  if (want("type")) {
    const editor = cell.locator('[role="textbox"][aria-multiline="true"]').first();
    await editor.click();
    await page.evaluate(() => {
      const probe = { lat: [] };
      globalThis.__typeLat = probe;
      document.addEventListener("keydown", () => {
        const t0 = performance.now();
        requestAnimationFrame(() => probe.lat.push(performance.now() - t0));
      }, true);
    });
    await startSampler(page);
    await page.keyboard.type(" benchmark typing latency probe characters", { delay: 35 });
    const frame = await stopSampler(page);
    const lat = (await page.evaluate(() => globalThis.__typeLat.lat)).sort((a, b) => a - b);
    const avgLat = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0;
    record("type", { ...frame, keyAvgMs: Number(avgLat.toFixed(1)), keyP95Ms: Number((lat[Math.floor(lat.length * 0.95)] ?? 0).toFixed(1)) });
    await page.keyboard.press("Escape");
  }

  // ---- settings: column count changes force a full grid restyle ------------
  if (want("settings")) {
    await page.getByRole("button", { name: "Layout settings" }).first().click();
    const columnsInput = page.locator(".osionos-layout-settings-panel .osionos-layout-control-row", { hasText: "Columns" }).locator("input");
    await startSampler(page);
    for (const value of ["16", "12", "16", "12", "16", "12", "16", "12"]) {
      await columnsInput.fill(value);
      await page.waitForTimeout(120);
    }
    record("settings", await stopSampler(page));
    await page.getByRole("button", { name: "Close layout settings" }).click().catch(() => {});
  }

  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      const tail = Object.entries(r).filter(([k]) => !["stage", "impl", "cells", "cpu"].includes(k))
        .map(([k, v]) => `${k}=${v}`).join(" ");
      console.log(`stage=${r.stage} impl=${r.impl} cells=${r.cells} cpu=${r.cpu} ${tail}`);
    }
  }
  await browser.close();
  server?.kill("SIGTERM");
}

main().catch((e) => { console.error(e); process.exit(1); });
