/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   liveMountHeal.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Self-heal for ORPHANED live-mount references. A dashboard block persists its
// data source as a `baas:<dbId>:<table>` id (and a `<id>#<preset>` viewId). When
// a mount is later re-registered it gets a NEW dbId, stranding every reference
// authored against the old one — the bridge then 403s ("Database is not linked
// to an accessible workspace") because the old dbId truly no longer exists.
//
// These two pure functions decide the remap; the async wiring that lists the
// current accessible mounts and fetches their schemas lives in the hook
// (useHealedLiveDatabaseId), so the decision stays dependency-free and testable.

/**
 * The dbId of the accessible mount that serves `table`, or null when the remap
 * would be unsafe:
 *   - the current dbId is STILL accessible (not orphaned — nothing to heal), or
 *   - the table is served by zero, or by MORE THAN ONE, accessible mount
 *     (ambiguous — a wrong guess is worse than the honest error).
 * A null result leaves the original denial to stand.
 */
export function pickMountForTable(
  table: string,
  currentDbId: string,
  mounts: readonly { dbId: string }[],
  tablesByDbId: ReadonlyMap<string, readonly string[]>,
): string | null {
  if (mounts.some((mount) => mount.dbId === currentDbId)) return null;
  const matches = mounts
    .map((mount) => mount.dbId)
    .filter((dbId) => (tablesByDbId.get(dbId) ?? []).includes(table));
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Rewrites a view id onto a healed database id, preserving its `#<preset>`
 * suffix (`baas:<old>:<t>#commerce-hub` → `baas:<new>:<t>#commerce-hub`). Only
 * a viewId that actually belongs to `oldDatabaseId` is rewritten; anything else
 * is returned untouched so an unrelated id is never mangled.
 */
export function rewriteViewId(viewId: string, oldDatabaseId: string, newDatabaseId: string): string {
  if (viewId === oldDatabaseId) return newDatabaseId;
  if (viewId.startsWith(`${oldDatabaseId}#`)) return newDatabaseId + viewId.slice(oldDatabaseId.length);
  return viewId;
}
