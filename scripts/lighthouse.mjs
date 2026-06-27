/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   lighthouse.mjs                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Reproducible Lighthouse runner. Always points at a *production* build served
// by `vite preview` (dev-mode scores are meaningless). Runs the bundled
// lighthouse CLI through npx so no extra dependency is pinned in the image.
//
//   node scripts/lighthouse.mjs <url> [--min=90] [--preset=desktop]
//
// In Docker:  bash scripts/docker-run.sh lighthouse <url>

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];
const REPORT_DIR = resolve(process.cwd(), "test-results/lighthouse");

function parseArgs(argv) {
  const url = argv.find((arg) => /^https?:\/\//.test(arg)) ?? process.env.LH_URL ?? "http://127.0.0.1:4173/";
  const min = Number(argv.find((arg) => arg.startsWith("--min="))?.slice(6) ?? process.env.LH_MIN ?? 90);
  const preset = argv.find((arg) => arg.startsWith("--preset="))?.slice(9);
  const chrome = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
  return { url, min, preset, chrome };
}

function runLighthouse({ url, preset, chrome }) {
  mkdirSync(REPORT_DIR, { recursive: true });
  const jsonPath = resolve(REPORT_DIR, "report.json");
  const args = [
    "-y", "lighthouse@12", url,
    "--quiet",
    `--only-categories=${CATEGORIES.join(",")}`,
    "--chrome-flags=--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage",
    "--output=json",
    `--output-path=${jsonPath}`,
  ];
  if (preset) args.push(`--preset=${preset}`);
  const result = spawnSync("npx", args, {
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, CHROME_PATH: chrome },
  });
  if (result.status !== 0) throw new Error(`lighthouse exited with code ${result.status}`);
  return jsonPath;
}

function reportScores(jsonPath, min) {
  const report = JSON.parse(readFileSync(jsonPath, "utf8"));
  let failed = false;
  console.log(`\nLighthouse — ${report.finalDisplayedUrl ?? report.requestedUrl}`);
  for (const key of CATEGORIES) {
    const score = Math.round((report.categories[key]?.score ?? 0) * 100);
    const ok = score >= min;
    failed = failed || !ok;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${key.padEnd(16)} ${score}`);
  }
  console.log(`\nJSON report: ${jsonPath}`);
  return !failed;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const jsonPath = runLighthouse(options);
  const passed = reportScores(jsonPath, options.min);
  process.exit(passed ? 0 : 1);
}

main();
