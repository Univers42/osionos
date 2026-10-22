/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   recsHealthSeries.ts                                 :+:      :+:    :+:   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 18:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 18:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * THE TWO SERIES of the recs health chart, as PURE functions: no fetch, no
 * clock, no state — the rows of the server's answer in, the points of the two
 * charts out.
 *
 * A RATE IS NEVER ZERO. A day with no impression has no click-through rate, and
 * a rate of zero would say "nobody clicked" where the truth is "nobody was
 * shown anything": the chart shows a gap, not a line on the floor. The counts
 * are carried beside the rate, so a reader can judge the noise of a thin day.
 *
 * SYNTHETIC AND REAL STAY APART. A simulation is not a use: the two are counted
 * apart, and the chart draws two lines, never a sum.
 */

/** One day of the server's answer. */
export interface DailyRow {
  day?: string | null;
  isSynthetic?: boolean;
  impressions?: number | null;
  clicks?: number | null;
}

/** One model of the server's answer. */
export interface ModelRow {
  id?: number | string | null;
  createdAt?: string | null;
  status?: string | null;
  isSynthetic?: boolean;
  eventsUsed?: number | null;
  ndcg10?: number | null;
  recall20?: number | null;
}

/** One day of the click-through chart: the two rates and the counts behind them. */
export interface CtrPoint {
  day: string;
  realCtr: number | null;
  syntheticCtr: number | null;
  realImpressions: number;
  realClicks: number;
  syntheticImpressions: number;
  syntheticClicks: number;
}

/** One model of the quality chart: its two metrics, and what it is. */
export interface ModelPoint {
  id: string;
  createdAt: string | null;
  label: string;
  isChampion: boolean;
  isSynthetic: boolean;
  ndcg10: number | null;
  recall20: number | null;
  eventsUsed: number | null;
}

/** A count the server may have left out: a missing count is no count. */
const count = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

/** A metric of a model: a number, or null when the model carries none. */
const metric = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/** The rate of a day: clicks over impressions — and NOTHING when nothing was shown. */
const rate = (clicks: number, impressions: number): number | null =>
  impressions > 0 ? clicks / impressions : null;

/**
 * The daily click-through: ONE row per day, the real and the synthetic counted
 * apart, the days in order.
 */
export function ctrSeries(daily: DailyRow[]): CtrPoint[] {
  const byDay = new Map<string, CtrPoint>();
  for (const row of daily ?? []) {
    const day = typeof row?.day === "string" ? row.day : "";
    if (!day) continue;
    const point = byDay.get(day) ?? {
      day, realCtr: null, syntheticCtr: null,
      realImpressions: 0, realClicks: 0, syntheticImpressions: 0, syntheticClicks: 0,
    };
    const impressions = count(row.impressions);
    const clicks = count(row.clicks);
    if (row.isSynthetic === true) {
      point.syntheticImpressions += impressions;
      point.syntheticClicks += clicks;
    } else {
      point.realImpressions += impressions;
      point.realClicks += clicks;
    }
    byDay.set(day, point);
  }
  return [...byDay.values()]
    .sort((left, right) => (left.day < right.day ? -1 : left.day > right.day ? 1 : 0))
    .map((point) => ({
      ...point,
      realCtr: rate(point.realClicks, point.realImpressions),
      syntheticCtr: rate(point.syntheticClicks, point.syntheticImpressions),
    }));
}

/** The name of a model on the chart: a synthetic model says so. */
function modelLabel(model: ModelRow, index: number): string {
  const name = `Model ${model.id ?? index + 1}`;
  return model.isSynthetic === true ? `${name} (synthetic)` : name;
}

/**
 * The quality of every model, oldest first — the line of the chart is the
 * recommender's own history. A model without a metric carries a null, never a
 * zero: "not measured" is not "measured as zero".
 */
export function modelSeries(models: ModelRow[]): ModelPoint[] {
  return (models ?? [])
    .filter((model) => model !== null && model !== undefined)
    .map((model, index) => ({
      id: String(model.id ?? index),
      createdAt: typeof model.createdAt === "string" ? model.createdAt : null,
      label: modelLabel(model, index),
      isChampion: model.status === "champion",
      isSynthetic: model.isSynthetic === true,
      ndcg10: metric(model.ndcg10),
      recall20: metric(model.recall20),
      eventsUsed: metric(model.eventsUsed),
    }))
    .sort((left, right) => {
      if (left.createdAt === right.createdAt) return 0;
      if (!left.createdAt) return 1;
      if (!right.createdAt) return -1;
      return left.createdAt < right.createdAt ? -1 : 1;
    });
}
