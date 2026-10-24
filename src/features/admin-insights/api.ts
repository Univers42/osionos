/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   api.ts                                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client of the admin aggregate route (scripts/bridge-account-insights.mjs).
 *
 * Every cell is rebuilt here field by field, so a key the bridge should not have sent (a user
 * id, a row id) cannot reach the panel. The bridge stores only day-cells of 5 or more people
 * and answers nothing about what it left out; this client invents no such hint either.
 */

import { api, getActivePageJwt } from "@/shared/api/client";

export const DAY_CHOICES = [7, 14, 30, 60, 90] as const;
export type DayChoice = (typeof DAY_CHOICES)[number];

export interface InsightCell {
  day: string;
  event: string;
  surface: string;
  events: number;
  users: number;
}

export interface Insights {
  cells: InsightCell[];
  totalOfShownCells: number;
}

export interface DayPoint {
  day: string;
  events: number;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

function toCell(raw: unknown): InsightCell {
  const row = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return { day: text(row.day), event: text(row.event), surface: text(row.surface), events: count(row.events), users: count(row.users) };
}

/** Caveat: a cell with a missing field is kept with empty or zero values rather than dropped,
 *  so a bridge bug shows as a blank row instead of a silently shorter list. */
export async function fetchInsights(days: DayChoice): Promise<Insights> {
  const res = await api.get<{ cells?: unknown; totalOfShownCells?: unknown }>(
    `/api/account/admin/insights?days=${days}`,
    getActivePageJwt() ?? undefined,
  );
  const cells = Array.isArray(res?.cells) ? res.cells.map(toCell) : [];
  return { cells, totalOfShownCells: cells.reduce((sum, cell) => sum + cell.events, 0) };
}

/** Events per day, oldest first: the sum of the displayed cells, nothing more. */
export function eventsPerDay(cells: readonly InsightCell[]): DayPoint[] {
  const byDay = new Map<string, number>();
  for (const cell of cells) byDay.set(cell.day, (byDay.get(cell.day) ?? 0) + cell.events);
  return [...byDay].sort(([a], [b]) => (a < b ? -1 : Number(a > b))).map(([day, events]) => ({ day, events }));
}
