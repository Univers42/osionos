/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseExportSource.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Resolves a database block (database_inline / database_full_page) to tabular
// data for CSV/HTML export, straight from the object-database state store.
//   current view  = the block's own view (visibleProperties order + its sort)
//   default view  = the database's first view; no view at all = full schema
// View FILTERS are not re-evaluated here (the filter engine lives in the
// database package); the column set, order and primary sort are honored.

import type { Block } from "@/entities/block";
import type { NotionState, PropertyValue, ViewConfig } from "@notion-db/contract-types";
import type { ExportDatabase, ExportDbViews } from "./exportTypes";

export function stringifyPropertyValue(value: PropertyValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => stringifyPropertyValue(item as PropertyValue)).join(", ");
  if (typeof value === "object") {
    const named = value as { name?: unknown; title?: unknown; label?: unknown };
    const label = named.name ?? named.title ?? named.label;
    if (typeof label === "string") return label;
    return JSON.stringify(value);
  }
  return String(value);
}

function viewsForDatabase(state: NotionState, databaseId: string): ViewConfig[] {
  return Object.values(state.views).filter((view) => view.databaseId === databaseId);
}

function pickView(state: NotionState, block: Block, databaseId: string, mode: ExportDbViews): ViewConfig | null {
  const views = viewsForDatabase(state, databaseId);
  if (views.length === 0) return null;
  if (mode === "current" && block.viewId) {
    return views.find((view) => view.id === block.viewId) ?? views[0]!;
  }
  return views[0]!;
}

function columnIds(state: NotionState, databaseId: string, view: ViewConfig | null): string[] {
  const schema = state.databases[databaseId];
  if (!schema) return [];
  const all = Object.keys(schema.properties);
  if (view && view.visibleProperties.length > 0) {
    return view.visibleProperties.filter((id) => schema.properties[id]);
  }
  // No view: title property first, then the rest in schema order.
  return [schema.titlePropertyId, ...all.filter((id) => id !== schema.titlePropertyId)]
    .filter((id, index, list) => schema.properties[id] && list.indexOf(id) === index);
}

/** Resolve one database block; null when the database is unknown locally. */
export function resolveDatabaseExport(
  state: NotionState,
  block: Block,
  mode: ExportDbViews,
): ExportDatabase | null {
  const databaseId = block.databaseId;
  if (!databaseId) return null;
  const schema = state.databases[databaseId];
  if (!schema) return null;

  const view = pickView(state, block, databaseId, mode);
  const ids = columnIds(state, databaseId, view);
  if (ids.length === 0) return null;

  const rows = Object.values(state.pages)
    .filter((page) => page.databaseId === databaseId && !page.archived)
    .map((page) => ids.map((id) => stringifyPropertyValue(page.properties[id])));

  const sort = view?.sorts?.[0];
  if (sort) {
    const index = ids.indexOf(sort.propertyId);
    if (index >= 0) {
      const direction = sort.direction === "desc" ? -1 : 1;
      rows.sort((a, b) => direction * (a[index] ?? "").localeCompare(b[index] ?? "", undefined, { numeric: true }));
    }
  }

  return {
    id: databaseId,
    title: schema.name || "Untitled database",
    columns: ids.map((id) => schema.properties[id]?.name ?? id),
    rows,
  };
}

export function isDatabaseBlock(block: Block): boolean {
  return block.type === "database_inline" || block.type === "database_full_page";
}
