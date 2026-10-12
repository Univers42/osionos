/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   run.ts                                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { formatNs, measure, type BenchResult, type BenchSuite } from "./harness.ts";

// Usage: node --experimental-strip-types --expose-gc tests/bench/run.ts tests/bench/x.bench.ts…
// Each file exports `bench` (a BenchSuite). Exit 1 when any case's p95 exceeds its budget.
const OUT_DIR = "test-results/bench";

function isSuite(value: unknown): value is BenchSuite {
  return typeof value === "object" && value !== null && "suite" in value && "cases" in value;
}

function row(result: BenchResult): string {
  const cells = [formatNs(result.medianNs), formatNs(result.p95Ns), formatNs(result.p99Ns), formatNs(result.budgetNs)];
  return `${result.ok ? "ok  " : "OVER"} ${result.name.padEnd(52)} ${cells.map((c) => c.padStart(11)).join(" ")}  ×${result.batch}`;
}

async function runFile(file: string): Promise<BenchResult[]> {
  const loaded: unknown = await import(pathToFileURL(resolve(file)).href);
  const suite = typeof loaded === "object" && loaded !== null && "bench" in loaded ? loaded.bench : undefined;
  if (!isSuite(suite)) throw new Error(`${file}: no exported \`bench\` suite`);
  console.log(`\n# ${suite.suite}  (${file})`);
  console.log(`     ${"case".padEnd(52)} ${["median", "p95", "p99", "budget"].map((h) => h.padStart(11)).join(" ")}  batch`);
  const results = suite.cases.map((entry) => {
    const result = measure(entry);
    console.log(row(result));
    return result;
  });
  mkdirSync(OUT_DIR, { recursive: true });
  const report = { suite: suite.suite, node: process.version, date: new Date().toISOString(), results };
  writeFileSync(`${OUT_DIR}/${basename(file, ".bench.ts")}.json`, `${JSON.stringify(report, null, 2)}\n`);
  return results;
}

const files = process.argv.slice(2);
if (files.length === 0) throw new Error("run.ts: pass at least one tests/bench/*.bench.ts file");
let over = 0;
for (const file of files) over += (await runFile(file)).filter((r) => !r.ok).length;
console.log(over === 0 ? "\nbench: every case within budget" : `\nbench: ${over} case(s) over budget`);
process.exitCode = over === 0 ? 0 : 1;
