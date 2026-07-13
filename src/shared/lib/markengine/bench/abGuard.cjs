/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   abGuard.cjs                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Hardware-relative benchmark guard: runs the current source AND a pinned
// reference commit's source through the SAME benchmark harness, in the SAME
// process, back to back, and gates on the ratio between them. Whatever the
// runner's absolute speed is, it applies equally to both sides, so the ratio
// stays meaningful on a laptop, a CI runner, or anything else.
//
// See reference.json for the pinned ref + tolerance, and
// docs/phase-1-3-benchmark-report.md for the measured same-run noise floor
// (<4% swing) that the tolerance is sized against.

const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runBenchmarks, compareResults } = require("./benchmarks.cjs");
const { materializeRef } = require("./referenceSource.cjs");

const REFERENCE_PATH = join(__dirname, "reference.json");

function loadReferenceConfig(path = REFERENCE_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function compareToReference(overrides = {}) {
  const config = { ...loadReferenceConfig(), ...overrides };
  const runOptions = {
    time: config.benchTimeMs,
    warmupTime: config.benchWarmupMs,
  };

  const head = runBenchmarks(runOptions);

  const reference = materializeRef(config.ref);
  let referenceResult;
  try {
    referenceResult = runBenchmarks({ ...runOptions, root: reference.dir });
  } finally {
    reference.cleanup();
  }

  const { comparisons, failures } = compareResults(
    head,
    referenceResult,
    config.tolerancePercent,
  );

  return { comparisons, failures, head, referenceResult, config };
}

module.exports = { compareToReference, loadReferenceConfig };
