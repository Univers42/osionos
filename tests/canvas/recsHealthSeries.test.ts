/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   recsHealthSeries.test.ts                           :+:      :+:    :+:   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 18:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 18:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * THE TWO SERIES of the recs health chart: the daily click-through and the
 * quality of every model.
 *
 * What they must hold:
 *   - a day with NO impression has NO rate: null, never 0 and never NaN. A rate
 *     of zero would say "nobody clicked" where the truth is "nobody was shown
 *     anything".
 *   - the real and the synthetic stay apart on the same day.
 *   - the models come in the order they were trained.
 *   - a model whose metric is missing carries a null, not a zero.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { ctrSeries, modelSeries } from "@/widgets/admin-space/model/recsHealthSeries";

test("a day with no impression has no rate", () => {
  const rows = ctrSeries([{ day: "2026-10-20", isSynthetic: false, impressions: 0, clicks: 0 }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].realCtr, null);
  assert.equal(rows[0].syntheticCtr, null);
  assert.ok(!Number.isNaN(rows[0].realCtr as unknown as number));
});

test("the rate is the clicks over the impressions", () => {
  const rows = ctrSeries([{ day: "2026-10-20", isSynthetic: false, impressions: 10, clicks: 3 }]);
  assert.equal(rows[0].realCtr, 0.3);
  assert.equal(rows[0].realClicks, 3);
  assert.equal(rows[0].realImpressions, 10);
});

test("the real and the synthetic stay apart on the same day", () => {
  const rows = ctrSeries([
    { day: "2026-10-20", isSynthetic: false, impressions: 10, clicks: 3 },
    { day: "2026-10-20", isSynthetic: true, impressions: 4, clicks: 4 },
  ]);
  assert.equal(rows.length, 1, "the two rows of a day are one row");
  assert.equal(rows[0].realCtr, 0.3);
  assert.equal(rows[0].syntheticCtr, 1);
  assert.equal(rows[0].realImpressions, 10);
  assert.equal(rows[0].syntheticImpressions, 4);
});

test("the days come in order", () => {
  const rows = ctrSeries([
    { day: "2026-10-22", isSynthetic: false, impressions: 1, clicks: 1 },
    { day: "2026-10-20", isSynthetic: false, impressions: 1, clicks: 1 },
  ]);
  assert.deepEqual(rows.map((row) => row.day), ["2026-10-20", "2026-10-22"]);
});

test("the models come in the order they were trained", () => {
  const points = modelSeries([
    { id: 2, createdAt: "2026-10-10T00:00:00.000Z", status: "champion", ndcg10: 0.42, recall20: 0.35 },
    { id: 1, createdAt: "2026-10-01T00:00:00.000Z", status: "retired", ndcg10: 0.31, recall20: 0.22 },
  ]);
  assert.deepEqual(points.map((point) => point.id), ["1", "2"]);
  assert.equal(points[0].isChampion, false);
  assert.equal(points[1].isChampion, true);
});

test("a model whose metric is missing carries a null, not a zero", () => {
  const points = modelSeries([{ id: 7, createdAt: "2026-10-01T00:00:00.000Z", status: "candidate", ndcg10: null }]);
  assert.equal(points[0].ndcg10, null);
  assert.equal(points[0].recall20, null);
});

test("a synthetic model says so on the chart", () => {
  const points = modelSeries([
    { id: 1, createdAt: "2026-10-01T00:00:00.000Z", status: "retired", isSynthetic: true, ndcg10: 0.2 },
    { id: 2, createdAt: "2026-10-02T00:00:00.000Z", status: "candidate", isSynthetic: false, ndcg10: 0.3 },
  ]);
  assert.equal(points[0].isSynthetic, true);
  assert.ok(points[0].label.includes("synthetic"), points[0].label);
  assert.equal(points[1].isSynthetic, false);
  assert.ok(!points[1].label.includes("synthetic"), points[1].label);
});
