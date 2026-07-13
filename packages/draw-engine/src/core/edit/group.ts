/**
 * Grouping: elements sharing a groupId behave as one unit. The mechanism is
 * deliberately thin — a group is nothing but a selection-expansion rule, so
 * move/delete/style all work on groups with zero extra code. Single-level.
 */

import type { DrawElement } from "../scene/element";

/** Grow `ids` to cover every member of every group touched. */
export function expandToGroups(elements: readonly DrawElement[], ids: Iterable<string>): Set<string> {
  const out = new Set(ids);
  const groups = new Set<string>();
  for (const element of elements) {
    if (out.has(element.id) && element.groupId) groups.add(element.groupId);
  }
  if (groups.size > 0) {
    for (const element of elements) {
      if (element.groupId && groups.has(element.groupId)) out.add(element.id);
    }
  }
  return out;
}

/** The selected elements stamped with a shared groupId (merging any old groups). */
export function groupPatches(
  elements: readonly DrawElement[],
  ids: ReadonlySet<string>,
  groupId: string,
): DrawElement[] {
  return elements
    .filter((element) => ids.has(element.id) && !element.isDeleted)
    .map((element) => ({ ...element, groupId }));
}

/** The selected elements with their groupId cleared. */
export function ungroupPatches(elements: readonly DrawElement[], ids: ReadonlySet<string>): DrawElement[] {
  return elements
    .filter((element) => ids.has(element.id) && !element.isDeleted && element.groupId)
    .map((element) => ({ ...element, groupId: null }));
}

/** True when the whole selection already sits in ONE group (→ offer Ungroup). */
export function isSingleGroup(elements: readonly DrawElement[], ids: ReadonlySet<string>): boolean {
  let group: string | null | undefined;
  let count = 0;
  for (const element of elements) {
    if (!ids.has(element.id) || element.isDeleted) continue;
    count += 1;
    if (group === undefined) group = element.groupId ?? null;
    else if ((element.groupId ?? null) !== group) return false;
  }
  return count > 1 && !!group;
}
