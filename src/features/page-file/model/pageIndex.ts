/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageIndex.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";

import { assignSiblingNames, kindOfPage } from "./pagePaths";
import type { PageFileKind } from "./types";

// Pure: no store import.

export interface PageIndexEntry {
  id: string;
  /** Workspace-relative POSIX path, as pathForEntry produces it. */
  path: string;
  kind: PageFileKind;
  parentId: string | null;
}

export interface PageIndex {
  /** Pre-order: a parent before its children, siblings in name order. */
  readonly entries: readonly PageIndexEntry[];
  /** The page whose OWN path is `path` (case-sensitive). */
  idForPath(path: string): string | undefined;
  pathForId(id: string): string | undefined;
  /** The page whose children live in `dirPath` ("Roadmap" for "Roadmap.omd", "main.ts.d" for "main.ts"). */
  ownerOfDir(dirPath: string): string | undefined;
}

interface Frame {
  entry: PageIndexEntry;
  dir: string;
}

type Groups = ReadonlyMap<string | null, readonly PageEntry[]>;

/**
 * Index every live page of one workspace, every path computed once.
 * Names come from assignSiblingNames once per sibling group, so each path equals
 * pathForEntry's. The walk starts at the root group: a page under an unknown or archived
 * parent, or inside a parent cycle, is never reached and gets no entry — pathForEntry
 * answers "" for it too. Explicit stack: a 10 000-deep chain must not overflow.
 * O(n log n) time (the per-group sorts), O(n) entries plus the path strings.
 */
export function buildPageIndex(pages: readonly PageEntry[]): PageIndex {
  const groups = liveGroups(pages);
  const entries: PageIndexEntry[] = [];
  const idByPath = new Map<string, string>();
  const pathById = new Map<string, string>();
  const ownerByDir = new Map<string, string>();
  const stack = childFrames(groups, null, "");
  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    const { entry, dir } = frame;
    if (pathById.has(entry.id)) continue;
    entries.push(entry);
    idByPath.set(entry.path, entry.id);
    pathById.set(entry.id, entry.path);
    ownerByDir.set(dir, entry.id);
    for (const child of childFrames(groups, entry.id, dir)) stack.push(child);
  }
  return {
    entries,
    idForPath: (path) => idByPath.get(path),
    pathForId: (id) => pathById.get(id),
    ownerOfDir: (dirPath) => ownerByDir.get(dirPath),
  };
}

function liveGroups(pages: readonly PageEntry[]): Groups {
  const groups = new Map<string | null, PageEntry[]>();
  for (const page of pages) {
    if (page.archivedAt) continue;
    const key = page.parentPageId ?? null;
    const group = groups.get(key);
    if (group) group.push(page);
    else groups.set(key, [page]);
  }
  return groups;
}

function joinPath(prefix: string, name: string): string {
  return prefix === "" ? name : `${prefix}/${name}`;
}

/** The live children of `parentId` in REVERSE name order, so the stack pops them in order. */
function childFrames(groups: Groups, parentId: string | null, prefix: string): Frame[] {
  const group = groups.get(parentId);
  if (!group) return [];
  const names = assignSiblingNames(group);
  const frames: Frame[] = [];
  for (const page of group) {
    const name = names.get(page._id);
    if (!name) continue;
    const entry = { id: page._id, path: joinPath(prefix, name.own), kind: kindOfPage(page), parentId };
    frames.push({ entry, dir: joinPath(prefix, name.childDir) });
  }
  return frames.sort((a, b) => (a.entry.path < b.entry.path ? 1 : a.entry.path > b.entry.path ? -1 : 0));
}
