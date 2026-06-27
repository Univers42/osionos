/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   templateRegistry.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { HeaderTemplate } from "./headerTemplate";
import type { RecordTemplate } from "./recordTemplate";

/**
 * A tiny registry keyed by database id (mirrors the *ViewPresets pattern). Presets
 * register at import time; the resolver returns null for every other database, so a
 * normal page keeps the classic header. A per-database persisted template (from the
 * visual designer) is layered on top by the resolving hook, not here.
 */
const headerByDatabase = new Map<string, HeaderTemplate>();
const recordByDatabase = new Map<string, RecordTemplate>();

export function registerHeaderTemplate(databaseId: string, template: HeaderTemplate): void {
  headerByDatabase.set(databaseId, template);
}

export function registerRecordTemplate(databaseId: string, template: RecordTemplate): void {
  recordByDatabase.set(databaseId, template);
}

export function resolveHeaderTemplate(databaseId?: string | null): HeaderTemplate | null {
  if (!databaseId) return null;
  return headerByDatabase.get(databaseId) ?? null;
}

export function resolveRecordTemplate(databaseId?: string | null): RecordTemplate | null {
  if (!databaseId) return null;
  return recordByDatabase.get(databaseId) ?? null;
}
