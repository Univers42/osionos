/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   lighthouse-categories.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Per-category Lighthouse sweep for the osionos PROD preview. Measures each Home
// surface (dashboard / Second Brain graph / database / gallery) via the ?home=
// deep-link, on both mobile and desktop presets, and prints a score matrix.
//
//   node scripts/lighthouse-categories.mjs [baseUrl] [--presets=mobile,desktop]
//
// Always point at `vite preview` (a production build); dev-mode scores are noise.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];
const REPORT_DIR = resolve(process.cwd(), "test-results/lighthouse");
const SURFACES = [
  { name: "dashboard", path: "/?home=dashboard" },
  { name: "graph", path: "/?home=graph" },
  { name: "database", path: "/?home=database" },
  { name: "gallery", path: "/?home=workspace" },
];

function parseArgs(argv) {
  const base = argv.find((a) => /^https?:\/\//.test(a)) ?? process.env.LH_URL ?? "http://127.0.0.1:4173";
  const presets = (argv.find((a) => a.startsWith("--presets="))?.slice(10) ?? "mobile,desktop").split(",");
  const chrome = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
  return { base: base.replace(/\/$/, ""), presets, chrome };
}

function runOne(url, preset, chrome) {
  mkdirSync(REPORT_DIR, { recursive: true });
  const jsonPath = resolve(REPORT_DIR, `cat-${Math.random().toString(36).slice(2)}.json`);
  const args = [
    "-y", "lighthouse@12", url, "--quiet",
    `--only-categories=${CATEGORIES.join(",")}`,
    "--chrome-flags=--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage",
    "--output=json", `--output-path=${jsonPath}`,
  ];
  if (preset === "desktop") args.push("--preset=desktop");
  const res = spawnSync("npx", args, { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, CHROME_PATH: chrome } });
  if (res.status !== 0) throw new Error(`lighthouse failed for ${url} (${preset})`);
  const r = JSON.parse(readFileSync(jsonPath, "utf8"));
  const score = (k) => Math.round((r.categories[k]?.score ?? 0) * 100);
  const metric = (k) => r.audits[k]?.displayValue ?? "";
  return {
    perf: score("performance"), a11y: score("accessibility"),
    bp: score("best-practices"), seo: score("seo"),
    lcp: metric("largest-contentful-paint"), tbt: metric("total-blocking-time"), fcp: metric("first-contentful-paint"),
  };
}

function summarize(rows) {
  console.log(`\n${"SURFACE".padEnd(12)}${"PRESET".padEnd(9)}${"PERF".padEnd(6)}${"A11Y".padEnd(6)}${"BP".padEnd(6)}${"SEO".padEnd(6)}${"LCP".padEnd(9)}${"TBT".padEnd(8)}FCP`);
  let allPass = true;
  for (const row of rows) {
    const ok = row.perf >= 90 && row.a11y >= 90 && row.bp >= 90 && row.seo >= 90;
    allPass = allPass && ok;
    const flag = ok ? "PASS" : "FAIL";
    console.log(`${row.surface.padEnd(12)}${row.preset.padEnd(9)}${String(row.perf).padEnd(6)}${String(row.a11y).padEnd(6)}${String(row.bp).padEnd(6)}${String(row.seo).padEnd(6)}${String(row.lcp).padEnd(9)}${String(row.tbt).padEnd(8)}${row.fcp}   ${flag}`);
  }
  return allPass;
}

function main() {
  const { base, presets, chrome } = parseArgs(process.argv.slice(2));
  const rows = [];
  for (const surface of SURFACES) {
    for (const preset of presets) {
      console.error(`[lh] ${surface.name} (${preset}) ...`);
      rows.push({ surface: surface.name, preset, ...runOne(`${base}${surface.path}`, preset, chrome) });
    }
  }
  const allPass = summarize(rows);
  process.exit(allPass ? 0 : 1);
}

main();
