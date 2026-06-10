import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
await page.addInitScript(() => {
  localStorage.setItem("osionos.home.variant", "graph");
  globalThis.___graphProfile = true;
});
await page.goto("http://127.0.0.1:4173/?home=graph&graphBench=10000", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector("canvas.osio-graph__fg", { timeout: 20000 });
await page.waitForTimeout(7000);
await page.evaluate(() => { globalThis.___graphTimes = {}; });
const box = await page.locator("canvas.osio-graph__fg").boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let i = 0; i < 14; i += 1) { await page.mouse.wheel(0, -240); await page.waitForTimeout(120); }
const times = await page.evaluate(() => globalThis.___graphTimes);
const frames = times.frames || 1;
const per = Object.fromEntries(Object.entries(times).filter(([k]) => k !== "frames").map(([k, v]) => [k, +(v / frames).toFixed(1)]));
console.log(JSON.stringify({ frames, perFrameMs: per }));
await browser.close();
