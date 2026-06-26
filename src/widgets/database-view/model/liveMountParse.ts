/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   liveMountParse.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pure parsing of a live-mount list payload — no app/env imports, so it is unit
 * testable in isolation (see tests/canvas/live-mount-parse.test.ts). Accepts the
 * bridge's `{dbId,name,engine}` shape AND the registry's `{id,name,engine}`
 * shape; drops anything without a usable id.
 */

/** One registered mount, combinable with its tables into `baas:<dbId>:<table>`. */
export interface LiveMountInfo {
  dbId: string;
  name: string;
  engine: string;
}

/** `[{id|dbId, name?, engine?}, …]` → `LiveMountInfo[]` (junk entries filtered). */
export function parseMounts(payload: unknown): LiveMountInfo[] {
  if (!Array.isArray(payload)) return [];
  const mounts: LiveMountInfo[] = [];
  for (const entry of payload) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const dbId = typeof record.id === "string" && record.id
      ? record.id
      : typeof record.dbId === "string" ? record.dbId : "";
    if (!dbId) continue;
    mounts.push({
      dbId,
      name: typeof record.name === "string" && record.name ? record.name : dbId,
      engine: typeof record.engine === "string" && record.engine ? record.engine : "unknown",
    });
  }
  return mounts;
}
