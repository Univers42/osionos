/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   threads.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The page's comment rows as the threads every surface draws (#228): a root with
 * its replies, oldest first. Open suggestions on one block whose text overlaps
 * compete — only one can be accepted — so they sit together, the leader first:
 * most 👍, then oldest. The list is flat so the panel can virtualize it.
 */

import type { Comment } from "../api/commentsClient";
import type { SuggestionAnchor } from "./suggestionAnchor";

export type SuggestionStatus = "open" | "accepted" | "rejected" | "superseded";

export interface Reaction {
  emoji: string;
  count: number;
  mine: boolean;
}

/** A row of `GET /api/comments`; the #228 fields are absent on an older bridge. */
export interface DiscussionRow extends Comment {
  parentId?: string | null;
  kind?: "comment" | "suggestion";
  anchor?: SuggestionAnchor | null;
  suggestion?: { insert: string } | null;
  status?: SuggestionStatus;
  decidedBy?: string | null;
  deleted?: boolean;
  reactions?: Reaction[];
}

export interface Thread {
  root: DiscussionRow;
  replies: DiscussionRow[];
  likes: number;
  /** The leading proposal's id when this open suggestion competes with it; null otherwise. */
  rivalOf: string | null;
}

const LIKE = "👍";

function likesOf(row: DiscussionRow): number {
  return row.reactions?.find((reaction) => reaction.emoji === LIKE)?.count ?? 0;
}

function byAge(left: DiscussionRow, right: DiscussionRow): number {
  if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? -1 : 1;
  return left.id < right.id ? -1 : 1;
}

function byLikesThenAge(left: Thread, right: Thread): number {
  return right.likes - left.likes || byAge(left.root, right.root);
}

function isOpenSuggestion(row: DiscussionRow): boolean {
  return row.kind === "suggestion" && (row.status ?? "open") === "open" && !row.deleted && !!row.anchor && !!row.blockId;
}

/**
 * Overlapping open suggestions of one block, as clusters (overlap is not transitive,
 * a cluster is its connected set). Sorted by start, a sweep keeps the cluster's
 * furthest end and whether an insertion sits on it: the same rule as
 * `suggestionsOverlap`, in O(n log n) instead of pairwise.
 */
function competingClusters(proposals: Thread[]): Thread[][] {
  const sorted = [...proposals].sort((a, b) => a.root.anchor!.start - b.root.anchor!.start || a.root.anchor!.end - b.root.anchor!.end);
  const clusters: Thread[][] = [];
  let reachEnd = -1;
  let insertionAtEnd = false;
  for (const thread of sorted) {
    const { start, end } = thread.root.anchor!;
    const isInsertion = start === end;
    const touches = start < reachEnd || (start === reachEnd && (isInsertion || insertionAtEnd));
    if (!touches || clusters.length === 0) {
      clusters.push([thread]);
      reachEnd = end;
      insertionAtEnd = isInsertion;
      continue;
    }
    clusters[clusters.length - 1].push(thread);
    if (end > reachEnd) [reachEnd, insertionAtEnd] = [end, isInsertion];
    else if (end === reachEnd) insertionAtEnd ||= isInsertion;
  }
  return clusters;
}

/** Ranks every cluster and returns, per member, the leader it follows. */
function rankRivals(roots: Thread[]): Map<Thread, Thread[]> {
  const byBlock = new Map<string, Thread[]>();
  for (const thread of roots) {
    if (!isOpenSuggestion(thread.root)) continue;
    const list = byBlock.get(thread.root.blockId!) ?? [];
    list.push(thread);
    byBlock.set(thread.root.blockId!, list);
  }
  const followers = new Map<Thread, Thread[]>();
  for (const proposals of byBlock.values()) {
    for (const cluster of competingClusters(proposals)) {
      if (cluster.length < 2) continue;
      cluster.sort(byLikesThenAge);
      const [leader, ...rest] = cluster;
      for (const thread of rest) thread.rivalOf = leader.root.id;
      followers.set(leader, rest);
    }
  }
  return followers;
}

export function threads(rows: readonly DiscussionRow[]): Thread[] {
  const roots = new Map<string, Thread>();
  for (const row of rows) {
    if (!row.parentId) roots.set(row.id, { root: row, replies: [], likes: likesOf(row), rivalOf: null });
  }
  for (const row of rows) {
    if (row.parentId) roots.get(row.parentId)?.replies.push(row);
  }
  const kept: Thread[] = [];
  for (const thread of roots.values()) {
    if (thread.root.deleted && thread.replies.length === 0) continue;
    thread.replies.sort(byAge);
    kept.push(thread);
  }
  kept.sort((left, right) => byAge(left.root, right.root));
  const followers = rankRivals(kept);
  const ordered: Thread[] = [];
  for (const thread of kept) {
    if (thread.rivalOf) continue;
    ordered.push(thread);
    const rest = followers.get(thread);
    if (rest) ordered.push(...rest);
  }
  return ordered;
}
