/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   benchmark.test.cjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

const test = require("node:test");
const assert = require("node:assert/strict");
const { compareToReference } = require("./abGuard.cjs");

test("markengine benchmarks stay within tolerance of the pinned reference commit (hardware-relative, same run)", () => {
  const { failures, comparisons, config } = compareToReference();

  console.table(
    comparisons.map((comparison) => ({
      benchmark: comparison.name,
      "head ops/sec": Math.round(comparison.headOpsPerSecond),
      "reference ops/sec": Math.round(comparison.referenceOpsPerSecond),
      "ratio": comparison.ratio.toFixed(3),
    })),
  );
  console.log(
    `Reference commit: ${config.ref} | tolerance: ${config.tolerancePercent}%`,
  );

  assert.deepEqual(failures, []);
});
