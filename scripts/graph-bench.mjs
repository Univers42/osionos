/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   graph-bench.mjs                                     :+:      :+:    :+:  */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Graph-engine FPS probe against a vite preview build.
//
//   node scripts/graph-bench.mjs [baseUrl] [--nodes=10000]
//
// Loads ?home=graph&graphBench=N (deterministic synthetic model), waits for
// layout to settle, then samples requestAnimationFrame deltas through three
// stages: idle, pan drag, and a zoom sweep. Report-only — judge the numbers
// against the previous run (target: pan/zoom >= 30 FPS avg at 10k nodes).

import { chromium, firefox } from "playwright";

function parseArgs(argv) {
  const base = (argv.find((a) => /^https?:\/\//.test(a)) ?? process.env.LH_URL ?? "http://127.0.0.1:4173").replace(/\/$/, "");
  const nodes = Number(argv.find((a) => a.startsWith("--nodes="))?.slice(8) ?? 10_000);
  const browser = argv.find((a) => a.startsWith("--browser="))?.slice(10) ?? "chromium";
  const dpr = Number(argv.find((a) => a.startsWith("--dpr="))?.slice(6) ?? 1);
  return { base, nodes, browser, dpr };
}

const SAMPLER = () => {
  const s = { deltas: [], last: 0, running: true };
  globalThis.__frames = s;
  const tick = (t) => {
    if (s.last) s.deltas.push(t - s.last);
    s.last = t;
    if (s.running) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

function summarize(stage, deltas) {
  const d = deltas.filter((x) => x > 0).sort((a, b) => a - b);
  if (d.length === 0) return { stage, frames: 0 };
  const avg = d.reduce((a, b) => a + b, 0) / d.length;
  return {
    stage,
    frames: d.length,
    avgMs: Number(avg.toFixed(1)),
    fps: Number((1000 / avg).toFixed(0)),
    p95Ms: Number((d[Math.floor(d.length * 0.95)] ?? 0).toFixed(1)),
    droppedPct: Number(((d.filter((x) => x > 33.4).length / d.length) * 100).toFixed(0)),
  };
}

async function sampleStage(page, name, action) {
  console.error(`[graph-bench] stage:${name}`);
  await page.evaluate(SAMPLER);
  await action();
  const deltas = await page.evaluate(() => {
    const s = globalThis.__frames;
    if (!s) return [];
    s.running = false;
    return s.deltas;
  });
  return summarize(name, deltas);
}

async function main() {
  const { base, nodes, browser: browserName, dpr } = parseArgs(process.argv.slice(2));
  const launcher = browserName === "firefox" ? firefox : chromium;
  const launchOpts = browserName === "firefox"
    ? { headless: true }
    : { headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] };
  const browser = await launcher.launch(launchOpts);
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: dpr })).newPage();
  await page.addInitScript(() => localStorage.setItem("osionos.home.variant", "graph"));

  console.error(`[graph-bench] ${browserName} dpr=${dpr} ${base} nodes=${nodes}`);
  await page.goto(`${base}/?home=graph&graphBench=${nodes}`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForSelector("canvas.osio-graph__fg", { timeout: 30_000 });
  await page.waitForTimeout(6000); // worker layout settle

  const canvas = await page.locator("canvas.osio-graph__fg").boundingBox();
  const cx = canvas.x + canvas.width / 2;
  const cy = canvas.y + canvas.height / 2;
  const results = [];

  results.push(await sampleStage(page, "idle", () => page.waitForTimeout(2000)));

  results.push(await sampleStage(page, "pan", async () => {
    // Grab near the canvas edge (empty space) so this measures CAMERA pan,
    // not a node drag (center always hits a node on a dense graph).
    const px = canvas.x + canvas.width * 0.06;
    const py = canvas.y + canvas.height * 0.92;
    await page.mouse.move(px, py);
    await page.mouse.down();
    let x = px;
    for (const [dir, dist] of [[1, 300], [-1, 600], [1, 300]]) {
      for (let m = 0; m < dist; m += 10) {
        x += dir * 10;
        await page.mouse.move(x, py + Math.sin(m / 40) * 40, { steps: 1 });
        await page.waitForTimeout(8);
      }
    }
    await page.mouse.up();
  }));

  results.push(await sampleStage(page, "zoom", async () => {
    await page.mouse.move(cx, cy);
    for (let i = 0; i < 24; i += 1) { await page.mouse.wheel(0, -240); await page.waitForTimeout(55); }
    for (let i = 0; i < 30; i += 1) { await page.mouse.wheel(0, 240); await page.waitForTimeout(55); }
    for (let i = 0; i < 12; i += 1) { await page.mouse.wheel(0, -240); await page.waitForTimeout(55); }
  }));

  console.log(JSON.stringify({ browser: browserName, nodes, results }, null, 1));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
