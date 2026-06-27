/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   liveChildRecords.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 07:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 07:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Layer 3 — "promote to a real child record". Where a record's SOURCE table has
 * a self-referential foreign key (e.g. employees.manager_id → employees.id), a
 * record can spawn a real child ROW in that same table, linked by the self-FK.
 * This is engine/mount-conditional (only lights up when such a column exists);
 * the universal note path is always available. Required NOT-NULL columns are
 * filled with type-appropriate placeholders so the insert satisfies the schema.
 */

import { api, getActivePageJwt } from "@/shared/api/client";
import type { LiveRecordRef } from "./recordSubItems";

interface ColumnInfo {
  name: string;
  normalized_type?: string;
  nullable?: boolean;
  default?: string | null;
  enum_values?: string[] | null;
  references?: { table?: string; column?: string } | null;
}

export interface SelfRefInfo {
  selfFkCol: string;
  pkCol: string;
  required: ColumnInfo[];
  tableLabel: string;
}

function coercePk(pk: string): string | number {
  return /^\d+$/.test(pk) ? Number(pk) : pk;
}

/** Inspect the table schema for a self-referential FK + the NOT-NULL columns a child insert must fill. */
export async function fetchSelfRefInfo(ref: LiveRecordRef): Promise<SelfRefInfo | null> {
  try {
    const schema = await api.get<{ tables?: { name?: string; table?: string; primary_key?: string[]; columns?: ColumnInfo[] }[] }>(
      `/api/databases/${encodeURIComponent(ref.dbId)}/schema`,
      getActivePageJwt() ?? undefined,
    );
    const table = (schema?.tables ?? []).find((t) => (t.name ?? t.table) === ref.table);
    const columns = table?.columns ?? [];
    const self = columns.find((c) => c.references?.table === ref.table);
    if (!self) return null;
    const pkCol = table?.primary_key?.[0] ?? "id";
    const required = columns.filter((c) =>
      c.nullable === false && (c.default == null) &&
      c.name !== pkCol && c.name !== self.name && c.name !== "owner_id" &&
      c.name !== "created_at" && c.name !== "updated_at",
    );
    return { selfFkCol: self.name, pkCol, required, tableLabel: ref.table };
  } catch {
    return null;
  }
}

/** Type-appropriate placeholder so a required column satisfies its NOT-NULL constraint. */
function placeholderFor(col: ColumnInfo, tableLabel: string): unknown {
  switch (col.normalized_type) {
    case "enum": return col.enum_values?.[0] ?? "";
    case "integer": case "number": case "decimal": case "float": case "numeric": case "bigint": return 0;
    case "boolean": case "checkbox": return false;
    case "date": return new Date().toISOString().slice(0, 10);
    case "datetime": case "timestamp": return new Date().toISOString();
    default:
      return /email/i.test(col.name) ? `child-${Date.now()}@example.local` : `New ${tableLabel}`;
  }
}

function buildChildData(info: SelfRefInfo, parentPk: string): Record<string, unknown> {
  const data: Record<string, unknown> = { [info.selfFkCol]: coercePk(parentPk) };
  for (const col of info.required) data[col.name] = placeholderFor(col, info.tableLabel);
  return data;
}

/** Existing child rows in the source table linked to this record by the self-FK. */
export async function listChildRecords(ref: LiveRecordRef, info: SelfRefInfo): Promise<Record<string, unknown>[]> {
  try {
    const res = await api.post<unknown>(
      `/api/databases/${encodeURIComponent(ref.dbId)}/tables/${encodeURIComponent(ref.table)}`,
      { op: "list", filter: { [info.selfFkCol]: coercePk(ref.pk) } },
      getActivePageJwt() ?? undefined,
    );
    if (Array.isArray(res)) return res as Record<string, unknown>[];
    const rows = (res as { rows?: unknown })?.rows;
    return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

/** Insert a real child row (placeholder NOT-NULL fields + the self-FK to the parent). */
export async function createChildRecord(ref: LiveRecordRef, info: SelfRefInfo): Promise<boolean> {
  try {
    const res = await api.post<{ affected_rows?: number } | unknown>(
      `/api/databases/${encodeURIComponent(ref.dbId)}/tables/${encodeURIComponent(ref.table)}`,
      { op: "insert", data: buildChildData(info, ref.pk) },
      getActivePageJwt() ?? undefined,
    );
    return res != null;
  } catch {
    return false;
  }
}

/** A short human label for one child row (its name-ish column, else its pk). */
export function childRecordLabel(row: Record<string, unknown>, pkCol: string): string {
  for (const key of ["name", "title", "full_name", "label", "email"]) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return `#${String(row[pkCol] ?? "")}`;
}
