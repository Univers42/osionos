/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bench-reference-marker.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A bench case that loses its budget must fail loudly, not turn into a reference row that never
// gates: only an explicit `reference: true` reports without a budget.

import assert from "node:assert/strict";
import test from "node:test";

import { defineBench } from "../bench/harness.ts";
import type { BenchCase } from "../bench/harness.ts";

const op = () => () => 0;

test("a case with neither a budget nor the reference marker is refused", () => {
  const lost = { name: "lost budget", setup: op } as unknown as BenchCase;
  assert.throws(() => defineBench("suite", [lost]), /"lost budget" has no budgetNs/);
});

test("a gated case and an explicit reference case are accepted", () => {
  const suite = defineBench("suite", [
    { name: "gated", budgetNs: 1_000, setup: op },
    { name: "platform call", reference: true, setup: op },
  ]);
  assert.equal(suite.cases.length, 2);
});

test("every bench suite in the repo passes the check", async () => {
  const { readdirSync } = await import("node:fs");
  const dir = new URL("../bench/", import.meta.url);
  const files = readdirSync(dir).filter((file) => file.endsWith(".bench.ts"));
  assert.ok(files.length > 0);
  for (const file of files) {
    const loaded = (await import(new URL(file, dir).href)) as { bench?: unknown };
    assert.ok(loaded.bench, `${file} exports its suite`);
  }
});
