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

// One round = HEAD and the reference commit, benchmarked back to back in this
// same process. `headFirst` alternates the order between rounds so neither
// side systematically benefits from a warm JIT / cold cache.
function runRound(runOptions, referenceRoot, headFirst) {
  if (headFirst) {
    const head = runBenchmarks(runOptions);
    const reference = runBenchmarks({ ...runOptions, root: referenceRoot });
    return { head, reference };
  }

  const reference = runBenchmarks({ ...runOptions, root: referenceRoot });
  const head = runBenchmarks(runOptions);
  return { head, reference };
}

function compareToReference(overrides = {}) {
  const config = { ...loadReferenceConfig(), ...overrides };
  const runOptions = {
    time: config.benchTimeMs,
    warmupTime: config.benchWarmupMs,
  };

  const reference = materializeRef(config.ref);
  const rounds = [];
  try {
    for (let index = 0; index < config.rounds; index++) {
      rounds.push(runRound(runOptions, reference.dir, index % 2 === 0));
    }
  } finally {
    reference.cleanup();
  }

  const { comparisons, failures } = compareResults(
    rounds,
    config.tolerancePercent,
  );

  return { comparisons, failures, rounds, config };
}

module.exports = { compareToReference, loadReferenceConfig };
