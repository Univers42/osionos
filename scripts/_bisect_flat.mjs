import { chromium } from "playwright";
const mode = process.argv[2] === "classic" ? false : true;
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
await page.addInitScript((sz) => {
  localStorage.setItem("osionos.home.variant", "graph");
  // Seed full default controls with semanticZoom toggled.
  const c = { filter: { hiddenDatabases: [], hiddenKinds: [], hiddenTags: [], tagColors: {} },
    physics: {}, visual: { nodeScale: 1, linkScale: 1, labelDensity: 0.5, glow: 1, background: "flat", semanticZoom: sz }, search: { query: "" } };
  localStorage.setItem("osio-graph-controls", JSON.stringify(c));
}, mode);
await page.goto("http://127.0.0.1:4173/?home=graph&graphBench=10000", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector("canvas.osio-graph__fg", { timeout: 20000 });
await page.waitForTimeout(7000);
// zoom sweep while sampling rAF deltas
await page.evaluate(() => {
  const s = { deltas: [], last: 0, running: true };
  globalThis.__fr = s;
  const tick = (t) => { if (s.last) s.deltas.push(t - s.last); s.last = t; if (s.running) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
const box = await page.locator("canvas.osio-graph__fg").boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let i = 0; i < 20; i += 1) { await page.mouse.wheel(0, -240); await page.waitForTimeout(55); }
for (let i = 0; i < 24; i += 1) { await page.mouse.wheel(0, 240); await page.waitForTimeout(55); }
const d = await page.evaluate(() => { const s = globalThis.__fr; s.running = false; return s.deltas; });
const dd = d.filter((x) => x > 0).sort((a, b) => a - b);
const avg = dd.reduce((a, b) => a + b, 0) / dd.length;
console.log(JSON.stringify({ mode: mode ? "semantic" : "classic", frames: dd.length, avgMs: +avg.toFixed(1), p95: +(dd[Math.floor(dd.length * 0.95)] ?? 0).toFixed(1) }));
await browser.close();
