/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   baasAggregate.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { baasPost } from "./baasFetch";

/**
 * BaaS aggregations (`op:"aggregate"` on `/query/v1/<dbId>/tables/<table>`):
 * COUNT/SUM/… + GROUP BY, owner-scoped (same RLS as `list`). The graph overview
 * is a bounded sample, so osionos uses these to show TRUE totals + real
 * distributions — honestly distinguishing "what's drawn" from "what exists".
 * Response shape: `{ rows: [{ <alias>, ...groupByCols }], rowCount }`.
 */

interface AggregateResponse {
  rows: Record<string, unknown>[];
  rowCount: number;
}

export interface GroupCount {
  key: string;
  count: number;
}

/** True row count of a table (optionally filtered) — beyond the overview's limit. */
export async function aggregateCount(
  dbId: string,
  table: string,
  filter?: Record<string, unknown>,
): Promise<number> {
  const response = await baasPost<AggregateResponse>(`/query/v1/${dbId}/tables/${table}`, {
    op: "aggregate",
    filter,
    aggregate: { aggregates: [{ func: "count", alias: "n" }] },
  });
  return countFromRows(response.rows, "n");
}

/** Counts grouped by a column (e.g. edge `type`), sorted desc — a real distribution. */
export async function aggregateGroupCount(
  dbId: string,
  table: string,
  column: string,
  filter?: Record<string, unknown>,
): Promise<GroupCount[]> {
  const response = await baasPost<AggregateResponse>(`/query/v1/${dbId}/tables/${table}`, {
    op: "aggregate",
    filter,
    aggregate: { groupBy: [column], aggregates: [{ func: "count", alias: "n" }] },
  });
  return groupCountsFromRows(response.rows, column, "n");
}

// ---- pure parsers (unit-tested against the real wire shape) -----------------

export function countFromRows(rows: Record<string, unknown>[], alias: string): number {
  return rows.length ? Number(rows[0][alias] ?? 0) : 0;
}

export function groupCountsFromRows(rows: Record<string, unknown>[], column: string, alias: string): GroupCount[] {
  return rows
    .map((row) => ({ key: String(row[column] ?? ""), count: Number(row[alias] ?? 0) }))
    .sort((a, b) => b.count - a.count);
}
