import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
await page.addInitScript(() => localStorage.setItem("osionos.home.variant", "graph"));
await page.goto("http://127.0.0.1:4173/?home=graph&graphBench=10000", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector("canvas.osio-graph__fg", { timeout: 20000 });
await page.waitForTimeout(7000);
const out = await page.evaluate(() => new Promise((resolve) => {
  const canvas = document.querySelector("canvas.osio-graph__fg");
  const rect = canvas.getBoundingClientRect();
  const s = { deltas: [], last: 0, long: [] };
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => s.long.push(Math.round(e.duration)))).observe({ type: "longtask" }); } catch {}
  const tick = (t) => { if (s.last) s.deltas.push(t - s.last); s.last = t; if (!s.done) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  let n = 0;
  const iv = setInterval(() => {
    n += 1;
    canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: n < 90 ? -120 : 120, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2, bubbles: true, cancelable: true }));
    if (n >= 180) {
      clearInterval(iv);
      s.done = true;
      const d = s.deltas.filter((x) => x > 0).sort((a, b) => a - b);
      resolve({ frames: d.length, avg: +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(1), p95: +(d[Math.floor(d.length * 0.95)] || 0).toFixed(1), longTasks: s.long.slice(0, 12) });
    }
  }, 16);
}));
console.log(JSON.stringify(out));
await browser.close();
