/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useHealedLiveDatabaseId.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Re-resolves an ORPHANED live data source (a `baas:<dbId>:<table>` whose mount
// was re-registered under a new id, e.g. a dashboard authored before a re-seed)
// to the CURRENT accessible mount that serves the same table, rewriting the
// matching viewId in lockstep so the preset (`#commerce-hub`) still selects.
//
// Healthy sources short-circuit on the cached mount list (no schema fetches, no
// re-render), so this is free on the common path; only an orphaned source pays
// the one-time scan. See liveMountHeal.ts for the pure decision logic.

import { useEffect, useState } from "react";

import { getLiveSchema } from "@/shared/notion-database-sys/src/store/live/liveMountClient";
import {
  isLiveDatabaseId,
  parseLiveDatabaseId,
} from "@/shared/notion-database-sys/src/store/live/liveTypes";
import { listLiveMounts } from "./liveMountCatalog";
import { pickMountForTable, rewriteViewId } from "./liveMountHeal";

/**
 * The healed `baas:<dbId>:<table>` id for an orphaned source, or null when no
 * heal applies (the id is still accessible, or the table maps to zero / >1
 * accessible mounts). Reuses the 60s-cached mount list + schema cache, so a
 * page full of dashboards costs ~one scan total.
 */
export async function resolveHealedLiveId(databaseId: string): Promise<string | null> {
  const ref = parseLiveDatabaseId(databaseId);
  if (!ref) return null;
  const mounts = await listLiveMounts();
  if (mounts.some((mount) => mount.dbId === ref.dbId)) return null; // accessible — not orphaned
  const tablesByDbId = new Map<string, string[]>();
  await Promise.all(
    mounts.map(async (mount) => {
      try {
        const schema = await getLiveSchema(mount.dbId);
        tablesByDbId.set(mount.dbId, schema.tables.map((entry) => entry.name));
      } catch {
        /* a mount we can't read this pass simply can't be the remap target */
      }
    }),
  );
  const healedDbId = pickMountForTable(ref.table, ref.dbId, mounts, tablesByDbId);
  return healedDbId ? `baas:${healedDbId}:${ref.table}` : null;
}

/**
 * Returns the source's ids healed if it is an orphaned live mount, else the
 * originals unchanged. Renders with the originals immediately (healthy sources
 * never change; an orphaned one briefly shows its own load error, then heals),
 * so no live block is ever gated on the network.
 */
export function useHealedLiveDatabaseId(
  databaseId: string | undefined,
  viewId: string | undefined,
): { databaseId: string | undefined; viewId: string | undefined } {
  // Keyed by the source it healed, so a heal from a PREVIOUS databaseId is
  // simply ignored in render — no synchronous reset (cascading render) needed.
  const [healed, setHealed] = useState<{ source: string; target: string } | null>(null);

  useEffect(() => {
    if (!databaseId || !isLiveDatabaseId(databaseId)) return;
    let cancelled = false;
    resolveHealedLiveId(databaseId)
      .then((next) => {
        if (!cancelled && next && next !== databaseId) setHealed({ source: databaseId, target: next });
      })
      .catch(() => {
        /* registry unreachable → keep originals; the load error surfaces as before */
      });
    return () => {
      cancelled = true;
    };
  }, [databaseId]);

  const target = healed && healed.source === databaseId ? healed.target : null;
  if (!target || !databaseId) return { databaseId, viewId };
  return {
    databaseId: target,
    viewId: viewId ? rewriteViewId(viewId, databaseId, target) : viewId,
  };
}
