// Headless browser ground-truth for the Second Brain graph: does the app load,
// reach the graph view, and successfully fetch the BaaS graph? Captures /query
// network results, console errors, and whether a sized canvas renders.
//   node scripts/sb-browser-check.mjs
import { chromium } from "playwright";

const URL = process.env.SB_URL ?? "http://localhost:3001/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

const queryCalls = [];
const errors = [];
page.on("response", async (r) => {
  if (!r.url().includes("/query/v1/")) return;
  let extra = "";
  if (r.status() >= 400) extra = " :: " + (await r.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
  queryCalls.push(`[${r.status()}] ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, "")}${extra}`);
});
const failed = [];
page.on("requestfailed", (r) => { failed.push(`${r.failure()?.errorText} ${r.url()}`.slice(0, 160)); if (r.url().includes("/query/v1/")) queryCalls.push(`[FAILED ${r.failure()?.errorText}] ${r.url().replace(/^https?:\/\/[^/]+/, "")}`); });
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text()}`.slice(0, 300)); });
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`.slice(0, 300)));

await page.goto(URL, { waitUntil: "domcontentloaded" }).catch((e) => errors.push("goto: " + e.message));
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/sb-1-loaded.png" }).catch(() => {});

// Reach the Second Brain graph: sidebar Home → open the variant dropdown → Second Brain.
await page.getByText("Home", { exact: true }).first().click({ timeout: 2000 }).catch(() => {});
await page.waitForTimeout(800);
await page.locator(".osionos-home-variant-menu > button").first().click({ timeout: 2000 }).catch(() => {});
await page.waitForTimeout(500);
await page.locator('.osionos-home-variant-dropdown button:has-text("Second Brain")').click({ timeout: 2000 }).catch(() => {});
await page.waitForTimeout(11000); // let overview fetch (+retries) + render
await page.screenshot({ path: "/tmp/sb-3-graph.png" }).catch(() => {});

await page.screenshot({ path: "/tmp/sb-2-after-nav.png" }).catch(() => {});
const navItems = await page.locator("button, a, [role=button]").allInnerTexts().catch(() => []);
console.log("=== clickable items (first 40) ===\n" + navItems.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 40).join(" | "));
console.log("\n=== failed requests (last 8) ===\n" + (failed.slice(-8).join("\n") || "(none)"));

const canvas = page.locator("canvas").first();
const hasCanvas = await canvas.count().catch(() => 0);
const box = hasCanvas ? await canvas.boundingBox().catch(() => null) : null;
const bodyText = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 240);

console.log("=== /query calls ===\n" + (queryCalls.join("\n") || "(NONE — graph view never fetched)"));
console.log("\n=== canvas ===\nfound:", hasCanvas, "size:", box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "n/a");
console.log("\n=== console errors/warnings (last 12) ===\n" + (errors.slice(-12).join("\n") || "(none)"));
console.log("\n=== visible body text (start) ===\n" + bodyText);
await browser.close();
