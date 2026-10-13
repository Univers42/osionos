/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inboundPlan.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The INBOUND decision table: one sandbox fs event, the ordered steps the
// executor must run. Pure and injected (InboundView is the only state read), so
// the whole table unit-tests without a store, a socket or a filesystem.
//
// The sandbox's fs-agent has NO rename event. A `mv` arrives as a delete of the
// old path plus a write per file under the new one, in arbitrary readdir order
// — so every row below asks "what would this ONE event mean", never "what does
// the batch mean". The move rows (R6b) are what stitch those fragments back
// into the single rename the user typed.

import { isEditorTempName, inboundSegments } from "./inboundNames";
import { skipLoud } from "./inboundPlanMove";
import { planInboundWrite, tempSkip } from "./inboundPlanWrite";

/** One decoded fs-agent event: `text` is the whole file, `hash` the agent's. */
export type InboundEvent =
  | { kind: "write"; path: string; hash: string; text: string }
  | { kind: "delete"; path: string };

/** The write half, narrowed for the row helpers. */
export type InboundWriteEvent = Extract<InboundEvent, { kind: "write" }>;

export type EntryRole = "page-file" | "folder-meta" | "code-file" | "children-dir" | "folder-dir";

/** The two roles a directory entry can play. */
export type DirRole = "children-dir" | "folder-dir";

/** One filesystem entry a page owns (its file, or one of its two directories). */
export type ViewEntry = { entryId: string; pageId: string; role: EntryRole; path: string };

/** Why a write naming page `Q`'s id is read as a MOVE of `Q`, not as a copy. */
export type MoveEvidence =
  | { kind: "own" }
  | { kind: "dir"; dir: string; role: DirRole; ownerId: string };

export type LivePage = {
  status: "live";
  path: string;
  filePath: string;
  isFolder: boolean;
  parentId: string | undefined;
};

export interface InboundView {
  /** Exact-case match, or `{ caseOf }` when only a case-insensitive match exists. */
  entryAt(segments: readonly string[]): ViewEntry | { caseOf: ViewEntry } | undefined;
  /** THIS workspace only. `path` is the workspace path (a folder's is its
   *  directory); `filePath` is its own file (folder → "<dir>/_folder.omd"). */
  pageState(pageId: string): LivePage | { status: "archived" } | undefined;
  hasOwnPending(pageId: string): boolean;
  /** "own" when the page itself is pending; else the DEEPEST pending deleted
   *  directory D (registered by a "deleted-dir" step) with D + "/" a prefix of
   *  the page's `filePath`; else undefined. A pending FILE delete of an
   *  ancestor is never evidence. O(depth). */
  moveEvidence(pageId: string): MoveEvidence | undefined;
  /** Archived by THIS tab's inbound flow within the restore window: its ledger
   *  hash and file path then. */
  archivedByInbound(pageId: string): { syncedHash: string | null; path: string } | undefined;
  canDelete(pageId: string): boolean;
  syncedHashOf(path: string): string | null;
  /** The page hash the last inbound apply/create at `path` left, while still valid (inboundLanded). */
  agreedPageHash(path: string, inboundHash: string): string | null;
  isEchoHash(hash: string): boolean;
  /** Live pages directly inside a children-dir / folder-dir entry. */
  childrenOf(entryId: string): readonly { pageId: string; path: string }[];
  /** The text the app would write for this page's own file (.omd, _folder.omd,
   *  code body). */
  localText(pageId: string): Promise<string>;
  /** Every directory a pending delete named (Q2's code-file move inference). */
  pendingDeletedDirs(): readonly { dir: string; role: DirRole; ownerId: string }[];
}

export type InboundStep =
  | { op: "skip"; reason: string; quiet: boolean }
  | { op: "record"; path: string; hash: string }
  | { op: "cancel-archive"; pageId: string }
  | { op: "schedule-archive"; pageId: string; path: string }
  | { op: "deleted-dir"; path: string; role: DirRole; ownerId: string }
  | { op: "restore"; pageId: string }
  | { op: "move"; pageId: string; fromPath: string; toPath: string; dir: boolean }
  | { op: "apply"; pageId: string; path: string; text: string; hash: string }
  | { op: "create"; path: string; text: string; hash: string; kind: "page" | "code" }
  | { op: "conflict"; pageId: string; path: string; theirs: string; hash: string };

/** A delete the user may not act on: the page stays, the file comes back. */
function readOnlySkip(path: string) {
  return skipLoud(`${path}: read-only for you; the page stays and the file returns on the next attach`);
}

/**
 * The steps ONE event means. The executor runs them in order and stops at the
 * first failing `restore`/`move`; nothing here archives on the spot — the
 * archive lands when the pending window ends and the state is re-checked.
 * O(s) steps for a write (one split, one front-matter parse, one sha16 over the
 * page's own file), O(pages directly inside a directory) for a children-dir delete.
 */
export async function planInbound(event: InboundEvent, view: InboundView): Promise<InboundStep[]> {
  if (event.kind === "delete") return planInboundDelete(event.path, view);
  return planInboundWrite(event, view);
}

/**
 * R9-R14. O(pages directly inside a directory) for the children-dir row; every
 * other row is O(depth of the path).
 */
function planInboundDelete(path: string, view: InboundView): InboundStep[] {
  const named = inboundSegments(path);
  if ("skip" in named) return [skipLoud(named.skip)];
  const entry = view.entryAt(named.segments);
  // R9: a vim save deletes its backup; that delete must not warn a second time.
  if (isEditorTempName(named.segments[named.segments.length - 1])) return [tempSkip(path, entry)];
  // R10: a delete of a name that differs only in case never touches a page;
  // R3 handles the write half of the same rename.
  if (entry === undefined || "caseOf" in entry) return [];
  // R12: `_folder.omd` alone — the folder stays, its directory delete decides.
  if (entry.role === "folder-meta") return [];
  if (entry.role === "folder-dir") return deleteFolderDir(path, entry, view);
  if (entry.role === "children-dir") return deleteChildrenDir(path, entry, view);
  return deleteOwnFile(path, entry.pageId, view);
}

/** R11: a page's own file. Nothing when its archive is already pending (a vim
 *  save deletes before it writes); loud when the user may not delete the page. */
function deleteOwnFile(path: string, pageId: string, view: InboundView): InboundStep[] {
  if (view.hasOwnPending(pageId)) return [];
  if (!view.canDelete(pageId)) return [readOnlySkip(path)];
  return [{ op: "schedule-archive", pageId, path }];
}

/** R14: the folder's own directory. O(1). */
function deleteFolderDir(path: string, entry: ViewEntry, view: InboundView): InboundStep[] {
  if (!view.canDelete(entry.pageId)) return [readOnlySkip(path)];
  const steps: InboundStep[] = [{ op: "deleted-dir", path, role: "folder-dir", ownerId: entry.pageId }];
  // A second delete of the same directory (an `rm -r` racing the dir delete) must
  // not queue the same archive twice.
  if (!view.hasOwnPending(entry.pageId)) steps.push({ op: "schedule-archive", pageId: entry.pageId, path });
  return steps;
}

/**
 * R13: a page's children directory. It NEVER touches its owner — `Roadmap/`
 * going missing is the shell tidying up around `Roadmap.omd`, not the user
 * deleting `Roadmap`. O(children directly inside).
 */
function deleteChildrenDir(path: string, entry: ViewEntry, view: InboundView): InboundStep[] {
  const steps: InboundStep[] = [{ op: "deleted-dir", path, role: "children-dir", ownerId: entry.pageId }];
  for (const child of view.childrenOf(entry.entryId)) {
    if (view.hasOwnPending(child.pageId)) continue;
    if (!view.canDelete(child.pageId)) {
      steps.push(readOnlySkip(child.path));
      continue;
    }
    steps.push({ op: "schedule-archive", pageId: child.pageId, path: child.path });
  }
  return steps;
}