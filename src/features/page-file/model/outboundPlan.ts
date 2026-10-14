/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   outboundPlan.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";

import type { PageIndex } from "./pageIndex";
import { kindOfPage } from "./pagePaths";
import { PAGE_FILE_SUFFIX, type PageFileKind } from "./types";

// Pure: no store import. Turns one page tree into the file operations that
// make the sandbox folder mirror it (ADR-005 outbound). Nothing here touches
// the filesystem — outboundRun.ts executes what this plans.

/** One pages tree plus the index built from it. */
export interface Snapshot {
  index: PageIndex;
  pages: readonly PageEntry[];
}

/** A rename the sandbox must perform, in the order planned (a parent first).
 *  `dir` marks FOLDER moves: a folder page itself, or the children dir of a
 *  moved file page (see childDirOfPath). */
export interface Move {
  id: string;
  from: string;
  to: string;
  dir: boolean;
}

/** A prev entry that vanishes from next — dirs are included, never deleted. */
export interface Remove {
  id: string;
  path: string;
}

/** What outboundRun must do to bring the sandbox to `next`'s shape. */
export interface OutboundPlan {
  moves: Move[];
  removes: Remove[];
  /** Ids whose page FILE the write phase should (re)materialize: every live
   *  page (kind page/dir, never code) that is new or whose object changed,
   *  with `content !== undefined`. Content-less pages (body not loaded) are
   *  skipped: their text cannot be produced without blanking the body, so a
   *  retitle renames their file but leaves its front-matter title stale. */
  changed: string[];
  /** Ids of CODE pages newly live in `next` (a restore or an app-created page): only these get a
   *  missing file remade, because the code editor already saves edits in place. */
  enteredCode: string[];
}

/** The directory that holds a page's children: page → strip ".omd", code →
 *  append ".d", folder → itself. O(1). */
export function childDirOfPath(kind: PageFileKind, path: string): string {
  switch (kind) {
    case "code":
      return path + ".d";
    case "page":
      return path.toLowerCase().endsWith(PAGE_FILE_SUFFIX)
        ? path.slice(0, -PAGE_FILE_SUFFIX.length)
        : path;
    case "dir":
      return path;
  }
}

/** A subtree relocation. `fromDir` is the ORIGINAL prev coordinate (so nested
 *  renames compose), `toDir` the next coordinate. */
interface Shift {
  fromDir: string;
  toDir: string;
}

/**
 * Plan the renames/removals/writes that turn `prev`'s tree into `next`'s.
 * `prev === null` is the baseline (the writer just started watching): an EMPTY plan — the
 * attach reconcile owns the full pass; the writer only follows changes made while it watches.
 * Equal indexes: a positional scan (no Map) finds the changed pages. Otherwise
 * one pre-order pass over next's entries plans the moves, one pass over prev's
 * the removes. O(n), n = next pages.
 */
export function planOutbound(prev: Snapshot | null, next: Snapshot): OutboundPlan {
  if (prev === null) return { moves: [], removes: [], changed: [], enteredCode: [] };
  if (prev.index === next.index) return { moves: [], removes: [], changed: changedByPosition(prev, next), enteredCode: [] };
  return {
    moves: planMoves(prev, next),
    removes: planRemoves(prev, next),
    changed: changedByMap(prev, next),
    enteredCode: enteredCodeByMap(prev, next),
  };
}

/** True when a page's file should be considered for writing. O(1). */
function wantsWrite(page: PageEntry): boolean {
  return kindOfPage(page) !== "code" && page.content !== undefined;
}

/**
 * Fast path (equal indexes): same length and same `_id` order mean position i
 * of prev and next is the same page, so no Map is needed. A position whose
 * object differs is a change candidate; the expensive index-liveness check
 * runs only on candidates (usually one). Falls back to changedByMap when the
 * arrays could not be aligned positionally. O(n).
 * Ponytail: an index VENDED from elsewhere (not pageIndexFor) can equal the
 * prev index while the pages are reordered — the _id check catches it and
 * falls back to the Map pass. Correct, only slower.
 */
function changedByPosition(prev: Snapshot, next: Snapshot): string[] {
  if (prev.pages.length !== next.pages.length) return changedByMap(prev, next);
  const candidates: string[] = [];
  for (let i = 0; i < next.pages.length; i++) {
    const before = prev.pages[i];
    const after = next.pages[i];
    if (!before || !after) continue;
    if (before._id !== after._id) return changedByMap(prev, next);
    if (before === after || !wantsWrite(after)) continue;
    candidates.push(after._id);
  }
  const index = next.index;
  return candidates.filter((id) => index.pathForId(id) !== undefined);
}

/**
 * Slow path: map prev pages by id, then scan next.
 * A page counts when it is worth writing, live in next's index, and either new
 * or not the same object as before. O(n) with O(1) lookups.
 */
function changedByMap(prev: Snapshot, next: Snapshot): string[] {
  const byId = new Map(prev.pages.map((page) => [page._id, page]));
  const changed: string[] = [];
  for (const page of next.pages) {
    if (!wantsWrite(page)) continue;
    if (next.index.pathForId(page._id) === undefined) continue;
    const before = byId.get(page._id);
    if (before === page) continue;
    changed.push(page._id);
  }
  return changed;
}

/**
 * CODE pages live in `next` but absent from `prev`: a restore or an app-created
 * page newly enters, while an edit or a move is in both and never listed.
 * O(n) with O(1) lookups per page.
 */
function enteredCodeByMap(prev: Snapshot, next: Snapshot): string[] {
  const entered: string[] = [];
  for (const page of next.pages) {
    if (kindOfPage(page) !== "code" || page.content === undefined) continue;
    if (next.index.pathForId(page._id) === undefined) continue;
    if (prev.index.pathForId(page._id) !== undefined) continue;
    entered.push(page._id);
  }
  return entered;
}

/** Every prev entry whose page is absent from next's index: it must leave the
 *  sandbox (the runner decides file-by-file, keeping shell edits). A path another
 *  live page owns now is that page's file: `rm -rf x && git clone x` archives the
 *  old pages and makes new ones at the same paths, and removing them deleted 231
 *  cloned files (live VM, 2026-10-14). O(n). */
function planRemoves(prev: Snapshot, next: Snapshot): Remove[] {
  const removes: Remove[] = [];
  for (const entry of prev.index.entries) {
    if (next.index.pathForId(entry.id) !== undefined) continue;
    if (next.index.idForPath(entry.path) !== undefined) continue;
    removes.push({ id: entry.id, path: entry.path });
  }
  return removes;
}

/**
 * One pre-order pass over next's entries, carrying each page's subtree shift
 * to its children. A moved page emits a move whose FROM is composed through
 * the parent's shift (the parent's rename has already run); descendants that
 * did not move AGAIN get no move — the ancestor's dir rename covers them.
 * O(n) with O(1) lookups per entry.
 * Ponytail: a child whose prev path does not start with its parent's original
 * dir (only possible when prev.index skipped that ancestor — a page revived
 * under a moved parent) gets no shift: its file is not re-renamed, so the
 * self-heal write on a failing rename covers it the next run.
 */
function planMoves(prev: Snapshot, next: Snapshot): Move[] {
  const moves: Move[] = [];
  const carryOf = new Map<string, Shift | null>();
  const entries = next.index.entries;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    const oldPath = prev.index.pathForId(entry.id);
    const carry = carryOf.get(entry.parentId ?? "") ?? null;
    const old = oldPath ?? "";
    const shifted = carry === null || !old.startsWith(carry.fromDir)
      ? old
      : carry.toDir + old.slice(carry.fromDir.length);
    const shiftedChild = childDirOfPath(entry.kind, shifted);
    const nextChild = childDirOfPath(entry.kind, entry.path);
    const moved = old !== "" && shifted !== entry.path;
    const hasChildren = i + 1 < entries.length && entries[i + 1]?.parentId === entry.id;
    if (!moved) {
      carryOf.set(entry.id, carry);
      continue;
    }
    if (entry.kind === "dir") {
      moves.push({ id: entry.id, from: shifted, dir: true, to: entry.path });
      carryOf.set(entry.id, { fromDir: old, toDir: entry.path });
      continue;
    }
    moves.push({ id: entry.id, from: shifted, dir: false, to: entry.path });
    if (hasChildren) {
      moves.push({ id: entry.id, from: shiftedChild, dir: true, to: nextChild });
      carryOf.set(entry.id, { fromDir: childDirOfPath(entry.kind, old), toDir: nextChild });
    } else {
      carryOf.set(entry.id, null);
    }
  }
  return moves;
}