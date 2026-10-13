/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   incrementalGrouping.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Ids grouped by key, each group in comparator order (ties: array order). */
export type IdGroups = ReadonlyMap<string, readonly string[]>;

interface Slot<T, C> {
  items: readonly T[];
  context: C;
  keys: (string | null)[];
  /** Position of item i inside its group, -1 when it is in none. */
  rank: Int32Array;
  members: Map<string, number[]>;
  groups: IdGroups;
}

// Above this many changed items in one commit a rebuild is cheaper than the neighbour checks.
const MAX_INCREMENTAL_CHANGES = 64;

/**
 * Groups `items` by `keyOf` (null = in no group) and sorts each group by `compare`, rebuilding
 * only when the result can differ. The store replaces a workspace's array on every commit, but
 * a title or content edit changes one item and neither its group nor its order: then the new
 * array is diffed against the previous one by identity (O(n) pointer compares), each changed
 * item is re-keyed and checked against its two group neighbours, and the previous `IdGroups`
 * (same Map, same arrays) is returned. Exact: a group stays sorted iff every adjacent pair is
 * in order, and only pairs touching a changed item can change. One slot per `lineage` (the
 * workspace), so trees of two workspaces do not evict each other.
 */
export function createIncrementalGrouping<T extends { _id: string }, C>(
  keyOf: (item: T, context: C) => string | null,
  compare: (a: T, b: T) => number,
): (items: readonly T[], context: C, lineage: string) => IdGroups {
  const slots = new Map<string, Slot<T, C>>();
  return (items, context, lineage) => {
    const slot = slots.get(lineage);
    if (slot && slot.items === items && slot.context === context) return slot.groups;
    if (slot && slot.context === context && isStillValid(slot, items, keyOf, compare)) {
      slot.items = items;
      return slot.groups;
    }
    const built = build(items, context, keyOf, compare);
    slots.set(lineage, built);
    return built.groups;
  };
}

function isStillValid<T extends { _id: string }, C>(
  slot: Slot<T, C>,
  items: readonly T[],
  keyOf: (item: T, context: C) => string | null,
  compare: (a: T, b: T) => number,
): boolean {
  const previous = slot.items;
  if (previous.length !== items.length) return false;
  const changed: number[] = [];
  for (let index = 0; index < items.length; index += 1) {
    if (items[index] === previous[index]) continue;
    if (items[index]._id !== previous[index]._id || changed.length === MAX_INCREMENTAL_CHANGES) return false;
    changed.push(index);
  }
  const before = (a: number, b: number) => {
    const order = compare(items[a], items[b]);
    return order < 0 || (order === 0 && a < b);
  };
  for (const index of changed) {
    const key = keyOf(items[index], slot.context);
    if (key !== slot.keys[index]) return false;
    if (key === null) continue;
    const group = slot.members.get(key) as number[];
    const at = slot.rank[index];
    if (at > 0 && !before(group[at - 1], index)) return false;
    if (at < group.length - 1 && !before(index, group[at + 1])) return false;
  }
  return true;
}

function build<T extends { _id: string }, C>(
  items: readonly T[],
  context: C,
  keyOf: (item: T, context: C) => string | null,
  compare: (a: T, b: T) => number,
): Slot<T, C> {
  const keys = items.map((item) => keyOf(item, context));
  const members = new Map<string, number[]>();
  keys.forEach((key, index) => {
    if (key === null) return;
    const group = members.get(key);
    if (group) group.push(index);
    else members.set(key, [index]);
  });
  const rank = new Int32Array(items.length).fill(-1);
  const groups = new Map<string, string[]>();
  for (const [key, group] of members) {
    // Indices are pushed ascending, so a stable sort keeps array order on ties.
    group.sort((a, b) => compare(items[a], items[b]));
    group.forEach((index, at) => { rank[index] = at; });
    groups.set(key, group.map((index) => items[index]._id));
  }
  return { items, context, keys, rank, members, groups };
}
