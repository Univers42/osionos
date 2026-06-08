/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   lighthouse-stateful.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Web-Vitals measurement for surfaces that live in localStorage state, not a
// URL: a single note page and an 8-pane split. Runs through Playwright + CDP
// throttling (single CDP client -- Lighthouse's own --port clashes with
// Playwright). Reports FCP / LCP / CLS / blocking-time under mobile (4x CPU +
// slow-4G) and desktop emulation, the same lab knobs Lighthouse uses.
//
//   node scripts/lighthouse-stateful.mjs [baseUrl] [--presets=mobile,desktop]

import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LAYOUT_KEY = "osionos.workspace.layout.v1";
const rid = () => Math.random().toString(36).slice(2, 9);
const pane = (tab) => ({ type: "pane", id: `pane-${rid()}`, tabs: [tab], activeTabId: tab.tabId });
const homeTab = () => ({ tabId: `tab-${rid()}`, pageId: "__home__", workspaceId: "", kind: "home", title: "Home", icon: "icon:home" });
const pageTab = (pid, ws) => ({ tabId: `tab-${rid()}`, pageId: pid, workspaceId: ws, kind: "page", title: "Page", icon: "icon:doc" });
const PRESETS = {
  mobile: { cpu: 4, net: { latency: 150, down: (1.6 * 1024 * 1024) / 8, up: (750 * 1024) / 8 } },
  desktop: { cpu: 1, net: null },
};

function parseArgs(argv) {
  const base = (argv.find((a) => /^https?:\/\//.test(a)) ?? process.env.LH_URL ?? "http://127.0.0.1:4173").replace(/\/$/, "");
  const presets = (argv.find((a) => a.startsWith("--presets="))?.slice(10) ?? "mobile,desktop").split(",");
  return { base, presets };
}

function buildScenarios(pid, ws) {
  const leaf = () => (pid ? pane(pageTab(pid, ws)) : pane(homeTab()));
  const eight = Array.from({ length: 8 }, leaf);
  const split = { type: "split", id: `split-${rid()}`, direction: "row", children: eight, sizes: eight.map(() => 12.5) };
  return {
    page: { root: leaf(), activePaneId: "" },
    "8pane-split": { root: split, activePaneId: eight[0].id },
  };
}

const OBSERVE = () => {
  const v = { fcp: 0, lcp: 0, cls: 0, tbt: 0 };
  globalThis.__vitals = v;
  const obs = (type, fn) => { try { new PerformanceObserver(fn).observe({ type, buffered: true }); } catch { /* */ } };
  obs("paint", (l) => l.getEntries().forEach((e) => { if (e.name === "first-contentful-paint") v.fcp = e.startTime; }));
  obs("largest-contentful-paint", (l) => { const e = l.getEntries(); v.lcp = e[e.length - 1].startTime; });
  obs("layout-shift", (l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) v.cls += e.value; }));
  obs("longtask", (l) => l.getEntries().forEach((e) => { v.tbt += Math.max(0, e.duration - 50); }));
};

async function measure(ctx, base, preset) {
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  // Cold load (match Lighthouse): the persistent context cached assets during the
  // seed visit; disable the HTTP cache so each measure pays the full download.
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: PRESETS[preset].cpu });
  const net = PRESETS[preset].net;
  if (net) await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: net.latency, downloadThroughput: net.down, uploadThroughput: net.up });
  await page.addInitScript(OBSERVE);
  await page.goto(`${base}/`, { waitUntil: "load", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(7000);
  const v = await page.evaluate(() => globalThis.__vitals);
  await page.close();
  return v;
}

async function main() {
  const { base, presets } = parseArgs(process.argv.slice(2));
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "lh-prof-")), {
    headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const seed = ctx.pages()[0] ?? (await ctx.newPage());
  await seed.goto(`${base}/`, { waitUntil: "load", timeout: 30000 });
  await seed.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith("osio:pages:")), { timeout: 25000 }).catch(() => {});
  const { ws, pid } = await seed.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("osio:pages:"));
    const wsId = key ? key.slice("osio:pages:".length) : "";
    let p = "";
    try { const a = JSON.parse(localStorage.getItem(key) || "[]"); p = (a.find((x) => !x.archivedAt && x.surface !== "folder") || a[0])?._id || ""; } catch { /* */ }
    return { ws: wsId, pid: p };
  });
  console.error(`[lh] seeded ws=${ws || "?"} page=${pid || "(home fallback)"}`);
  const scenarios = buildScenarios(pid, ws);
  const rows = [];
  for (const [name, layout] of Object.entries(scenarios)) {
    layout.activePaneId = layout.activePaneId || layout.root.id;
    await seed.evaluate(({ k, v }) => localStorage.setItem(k, v), { k: LAYOUT_KEY, v: JSON.stringify(layout) });
    for (const preset of presets) {
      console.error(`[lh] ${name} (${preset}) ...`);
      rows.push({ surface: name, preset, ...(await measure(ctx, base, preset)) });
    }
  }
  await ctx.close();
  console.log(`\n${"SURFACE".padEnd(14)}${"PRESET".padEnd(9)}${"FCP(ms)".padEnd(10)}${"LCP(ms)".padEnd(10)}${"CLS".padEnd(8)}BLOCKING(ms)`);
  for (const r of rows) {
    console.log(`${r.surface.padEnd(14)}${r.preset.padEnd(9)}${String(Math.round(r.fcp)).padEnd(10)}${String(Math.round(r.lcp)).padEnd(10)}${r.cls.toFixed(3).padEnd(8)}${Math.round(r.tbt)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
