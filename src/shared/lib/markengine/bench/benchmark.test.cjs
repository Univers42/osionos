/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   benchmark.test.cjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  compareToBaseline,
  loadBaseline,
  runBenchmarks,
} = require("./benchmarks.cjs");

test("markengine benchmarks stay within 10% of baseline", () => {
  const baseline = loadBaseline();
  const current = runBenchmarks();
  const failures = compareToBaseline(current, baseline);

  assert.deepEqual(failures, []);
});
