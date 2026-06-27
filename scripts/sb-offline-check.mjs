// Offline behavior: with the BaaS DOWN, a previously-cached graph snapshot must
// render (read-only) instead of a void graph, and the offline indicator shows.
//   node scripts/sb-offline-check.mjs   (run with the BaaS stopped)
import { chromium } from "playwright";

const URL = process.env.SB_URL ?? "http://localhost:3001/";

const snapshot = {
  at: Date.now(),
  response: {
    depth: 1,
    guarantee: "subgraph_eventual",
    nodes: [
      { id: "m:og_nodes:n1", mount: "m", resource: "og_nodes", pk: "n1", data: { title: "CACHED-A" } },
      { id: "m:og_nodes:n2", mount: "m", resource: "og_nodes", pk: "n2", data: { title: "CACHED-B" } },
      { id: "m:og_nodes:n3", mount: "m", resource: "og_nodes", pk: "n3", data: { title: "CACHED-C" } },
      { id: "m:og_nodes:n4", mount: "m", resource: "og_nodes", pk: "n4", data: { title: "CACHED-D" } },
    ],
    edges: [
      { id: "e1", from: "m:og_nodes:n1", to: "m:og_nodes:n2", type: "rel" },
      { id: "e2", from: "m:og_nodes:n1", to: "m:og_nodes:n3", type: "rel" },
      { id: "e3", from: "m:og_nodes:n1", to: "m:og_nodes:n4", type: "rel" },
    ],
  },
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
// Seed the snapshot into localStorage BEFORE the app boots.
await page.addInitScript((snap) => {
  window.localStorage.setItem("osio-sb-graph-snapshot", JSON.stringify(snap));
}, snapshot);

await page.goto(URL, { waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(2500);
// Reach the Second Brain graph.
await page.getByText("Home", { exact: true }).first().click({ timeout: 2000 }).catch(() => {});
await page.waitForTimeout(700);
await page.locator(".osionos-home-variant-menu > button").first().click({ timeout: 2000 }).catch(() => {});
await page.waitForTimeout(500);
await page.locator('.osionos-home-variant-dropdown button:has-text("Second Brain")').click({ timeout: 2000 }).catch(() => {});
// Bootstrap = 4 attempts × 2s before it falls back to the snapshot — wait it out.
await page.waitForTimeout(13000);

const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
const statusMatch = /(\d[\d,]*)\s+nodes/.exec(body);
console.log("status bar nodes:", statusMatch ? statusMatch[1] : "(not found)");
console.log("offline indicator present:", body.includes("offline · cached") ? "YES ✅" : "NO ❌");
console.log("graph rendered from cache (≥1 node, not void):", statusMatch && statusMatch[1] !== "0" ? "YES ✅" : "NO ❌");
console.log("fatal page errors:", errors.length ? errors.slice(0, 3) : "none ✅");
await page.screenshot({ path: "/tmp/sb-offline.png" }).catch(() => {});
await browser.close();
