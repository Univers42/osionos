/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tableRowOps.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { TableBlockConfig } from "@/entities/block";
import { normalizeTableData } from "./tableBlocks";

/** Moves an array item from one index to another, returning a new array. */
function moveArrayItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = items.slice();
  const clampedFrom = Math.max(0, Math.min(from, next.length - 1));
  const clampedTo = Math.max(0, Math.min(to, next.length - 1));
  const [moved] = next.splice(clampedFrom, 1);
  next.splice(clampedTo, 0, moved);
  return next;
}

/** Reorders a table row, returning new data (no-op when indices are equal). */
export function moveTableRow(tableData: string[][], from: number, to: number): string[][] {
  const data = normalizeTableData(tableData);
  if (from === to || data.length <= 1) return data;
  return moveArrayItem(data, from, to);
}

/** Reorders the per-row config (row heights) to match a moved row. */
export function moveConfigRow(config: TableBlockConfig, from: number, to: number): TableBlockConfig {
  if (from === to || !config.rowHeights || config.rowHeights.length <= 1) return config;
  return { ...config, rowHeights: moveArrayItem(config.rowHeights, from, to) };
}
