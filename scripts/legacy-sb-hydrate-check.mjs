// Proves the local-first READ path: a note that exists ONLY in the BaaS (never
// in this browser's localStorage) is restored into the sidebar on load.
//   node scripts/legacy-sb-hydrate-check.mjs
import { chromium } from "playwright";
import { readDotEnv, requiredEnv } from "./required-env.mjs";

const BAAS = "http://127.0.0.1:8000";
// Same keys the app is built with: the tenant key and Kong key from this checkout's .env.
const env = readDotEnv(".env");
const BAAS_HINT = "set it in apps/osionos/app/.env (make seed-live-demo mints the tenant key)";
const APIKEY = requiredEnv("VITE_BAAS_API_KEY", BAAS_HINT, env);
const KONG = requiredEnv("VITE_BAAS_KONG_KEY", BAAS_HINT, env);
const MONGO = "ca660785-ccc3-48b9-92fd-a47c7a863923";
const URL = process.env.SB_URL ?? "http://localhost:3001/";

const tag = Date.now().toString(36);
const title = `HYDRATE-RESTORE-${tag}`;
const id = `osio-note-hydrate-test-${tag}`;
const headers = { "Content-Type": "application/json", "X-Baas-Api-Key": APIKEY, apikey: KONG };

async function notes(op, body) {
  const r = await fetch(`${BAAS}/query/v1/${MONGO}/tables/og_notes`, { method: "POST", headers, body: JSON.stringify({ op, ...body }) });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

// 1) Seed a note straight into the BaaS, owned by mock-user-0, in the active private
//    space. Retry through the BaaS's intermittent 503 flapping, then verify it landed.
let seeded = false;
for (let attempt = 1; attempt <= 8 && !seeded; attempt += 1) {
  const ins = await notes("upsert", {
    filter: { id },
    data: { id, title, body: "restored from baas", contentJson: "[]", tags: [], visibility: "private", owner: "mock-user-0", workspaceId: "mock-ws-private-0", parentPageId: null, updatedAt: new Date().toISOString() },
  });
  if (ins.status < 400) seeded = true;
  else { console.log(`  seed attempt ${attempt} [${ins.status}] — retrying`); await new Promise((r) => setTimeout(r, 1500)); }
}
const check = await notes("list", { filter: { id }, limit: 1 });
const present = (check.json.rows ?? []).some((r) => r.id === id);
console.log(`seeded BaaS-only note ${id}: ${seeded && present ? "PRESENT ✅" : "FAILED ❌ (BaaS unreachable)"}`);
if (!present) { console.log("aborting — cannot test hydration without the seed row"); process.exit(1); }

// 2) Load the app in a FRESH context (clean localStorage → note is not there).
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const qcalls = [];
page.on("response", (r) => { if (r.url().includes("/query/v1/")) qcalls.push(`[${r.status()}] ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, "")}`); });
page.on("console", (m) => { const t = m.text(); if (t.includes("hydrate")) console.log("  console:", t.slice(0, 200)); });
await page.goto(URL, { waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(6000); // seed + hydrate (fetch BaaS notes → merge into page store)
const listCalls = qcalls.filter((c) => c.includes("og_notes")).slice(0, 6);
console.log("  og_notes /query calls during load:\n   " + (listCalls.join("\n   ") || "(none)"));

// 3) Is the BaaS-only note now in the sidebar?
const found = await page.getByText(title, { exact: false }).first().count().catch(() => 0);
const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
console.log("sidebar shows the restored note:", found > 0 ? "YES ✅" : "NO ❌");
console.log("title present in DOM text:", body.includes(title) ? "YES" : "NO");
await page.screenshot({ path: "/tmp/sb-hydrate.png" }).catch(() => {});

// 4) Cleanup the test row.
await notes("delete", { filter: { id } });
console.log("cleaned up test note");
await browser.close();
