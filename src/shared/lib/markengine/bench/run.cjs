const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const {
  compareToBaseline,
  loadBaseline,
  runBenchmarks,
} = require("./benchmarks.cjs");

const BASELINE_PATH = join(__dirname, "baseline.json");

function main() {
  const args = new Set(process.argv.slice(2));
  const current = runBenchmarks();

  if (args.has("--write-baseline")) {
    writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`Wrote benchmark baseline to ${BASELINE_PATH}`);
    return;
  }

  console.table(
    current.benchmarks.map((benchmark) => ({
      benchmark: benchmark.name,
      "ops/sec": Math.round(benchmark.opsPerSecond),
      "p50 ms": benchmark.latencyMs.p50,
      "p95 ms": benchmark.latencyMs.p95,
      samples: benchmark.samples,
    })),
  );

  if (args.has("--compare-baseline")) {
    const baseline = loadBaseline(BASELINE_PATH);
    const failures = compareToBaseline(current, baseline);
    if (failures.length > 0) {
      console.error("Benchmark regressions exceeded 10%:");
      for (const failure of failures) {
        console.error(`- ${failure}`);
      }
      process.exitCode = 1;
    }
  }
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
