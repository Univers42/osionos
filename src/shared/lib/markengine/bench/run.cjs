/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   run.cjs                                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

const { execFileSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { runBenchmarks } = require("./benchmarks.cjs");
const { compareToReference, loadReferenceConfig } = require("./abGuard.cjs");

const REFERENCE_PATH = join(__dirname, "reference.json");

function printTable(result) {
  console.table(
    result.benchmarks.map((benchmark) => ({
      benchmark: benchmark.name,
      "ops/sec": Math.round(benchmark.opsPerSecond),
      "p50 ms": benchmark.latencyMs.p50,
      "p95 ms": benchmark.latencyMs.p95,
      samples: benchmark.samples,
    })),
  );
}

function pinReference() {
  const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: __dirname,
    encoding: "utf8",
  }).trim();
  const config = loadReferenceConfig();
  config.ref = headSha;
  writeFileSync(REFERENCE_PATH, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Pinned benchmark reference commit to ${headSha}`);
}

function compareReference() {
  const { failures, comparisons, config } = compareToReference();
  console.table(
    comparisons.map((comparison) => ({
      benchmark: comparison.name,
      "head ops/sec": Math.round(comparison.headOpsPerSecond),
      "reference ops/sec": Math.round(comparison.referenceOpsPerSecond),
      ratio: comparison.ratio.toFixed(3),
    })),
  );
  console.log(
    `Reference commit: ${config.ref} | tolerance: ${config.tolerancePercent}% | best of ${config.rounds} rounds`,
  );
  if (failures.length > 0) {
    console.error(`Benchmark regressions exceeded ${config.tolerancePercent}%:`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  }
}

function main() {
  const args = new Set(process.argv.slice(2));

  if (args.has("--pin-reference")) {
    pinReference();
    return;
  }

  if (args.has("--compare-reference")) {
    compareReference();
    return;
  }

  printTable(runBenchmarks());
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
