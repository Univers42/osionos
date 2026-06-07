/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   baasDatabaseData.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { baasConfigured } from "@/features/second-brain/baas/baasFetch";
import { configuredResources, fetchGraphOverview } from "@/features/second-brain/baas/baasGraphClient";
import type { BaasGraphNode } from "@/features/second-brain/baas/types";

export interface DatabaseTable {
  table: string;
  rows: BaasGraphNode[];
}

export interface DatabaseMount {
  dbId: string;
  tables: DatabaseTable[];
}

/**
 * Browse the live BaaS as the real distributed database it is: a **mount** = a database, a
 * **resource** = a table, a node's `data` = a record (row). We sample it from the proven
 * `/query/v1/graph/overview` endpoint (already used by the Second Brain), so this needs no
 * new BaaS endpoint and honours "a database contains different tables".
 */
export async function fetchDatabaseCatalog(): Promise<DatabaseMount[]> {
  if (!baasConfigured()) return [];
  // Sampled view: up to 400 rows per resource (an overview, not the authoritative row count).
  const overview = await fetchGraphOverview(configuredResources(), 400);
  const byMount = new Map<string, Map<string, BaasGraphNode[]>>();
  for (const node of overview.nodes) {
    const tables = byMount.get(node.mount) ?? new Map<string, BaasGraphNode[]>();
    const rows = tables.get(node.resource) ?? [];
    rows.push(node);
    tables.set(node.resource, rows);
    byMount.set(node.mount, tables);
  }
  return [...byMount.entries()].map(([dbId, tables]) => ({
    dbId,
    tables: [...tables.entries()].map(([table, rows]) => ({ table, rows })),
  }));
}

/** Union of record `data` keys across a table's rows, in first-seen order (table columns). */
export function tableColumns(rows: readonly BaasGraphNode[]): string[] {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row.data ?? {})) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  return columns;
}

/** Render any record cell value as a compact string. */
export function cellText(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(cellText).filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
