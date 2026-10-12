/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   explorerRows.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { isFolderMetaName, isPageFileName } from "../../page-file/model/pageFileCodec";
import { titleFromFileName } from "../../page-file/model/pagePaths";
import type { ListedEntry } from "../vfs/types";
import { joinRel } from "./workspacePath";

export type ExplorerRowKind = "dir" | "page" | "code";

export type ExplorerRow = {
  name: string;
  kind: ExplorerRowKind;
  /** What the tree shows: the title for `.omd` pages, the file name otherwise. */
  label: string;
};

/** `.omd` opens as a block page; every other file opens as code. */
export function fileKindOf(name: string): "page" | "code" {
  return isPageFileName(name) ? "page" : "code";
}

// Natural order without Intl: localeCompare follows the browser locale, so the same
// folder would sort differently per user (and per Node ICU build in tests). Digit runs
// compare by value, everything else by lower-cased code unit, raw order breaks ties.
const NATURAL_CHUNK = /(\d+)/;

function compareNatural(a: string, b: string): number {
  const left = a.toLowerCase().split(NATURAL_CHUNK);
  const right = b.toLowerCase().split(NATURAL_CHUNK);
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    const x = left[i] ?? "";
    const y = right[i] ?? "";
    if (x === y) continue;
    if (i % 2 === 1) return Number(x) - Number(y) || x.length - y.length;
    return x < y ? -1 : 1;
  }
  return left.length - right.length;
}

const byName = (a: ExplorerRow, b: ExplorerRow): number =>
  compareNatural(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** One directory listing → display rows: folders first, natural-order names,
 *  `_folder.omd` hidden (it is a folder page's metadata, not a file to the user).
 *  O(n log n). */
export function buildExplorerRows(entries: readonly ListedEntry[]): ExplorerRow[] {
  const dirs: ExplorerRow[] = [];
  const files: ExplorerRow[] = [];
  for (const { name, kind } of entries) {
    if (kind === "dir") dirs.push({ name, kind: "dir", label: name });
    else if (!isFolderMetaName(name)) {
      const fileKind = fileKindOf(name);
      files.push({ name, kind: fileKind, label: fileKind === "page" ? titleFromFileName(name) : name });
    }
  }
  dirs.sort(byName);
  files.sort(byName);
  return dirs.concat(files);
}

export type DirState =
  | { status: "loading" }
  | { status: "ready"; rows: readonly ExplorerRow[] }
  | { status: "error"; message: string };

/** A row as laid out on screen, with its ARIA tree coordinates. */
export type VisibleItem = {
  rel: string;
  row: ExplorerRow;
  parentRel: string;
  level: number;
  setSize: number;
  posInSet: number;
};

/** The single place a row gets its ARIA tree coordinates (flattening and the
 *  recursive renderer both use it). */
export function visibleItemOf(dir: string, row: ExplorerRow, index: number, setSize: number, level: number): VisibleItem {
  return { rel: joinRel(dir, row.name), row, parentRel: dir, level, setSize, posInSet: index + 1 };
}

/** Depth-first list of the rows a user can currently reach — the order that
 *  ArrowUp/ArrowDown walk. Only expanded, loaded directories contribute. */
export function flattenVisible(
  dirs: Readonly<Record<string, DirState>>,
  expanded: ReadonlySet<string>,
): VisibleItem[] {
  const out: VisibleItem[] = [];
  const walk = (dir: string, level: number): void => {
    const state = dirs[dir];
    if (state?.status !== "ready") return;
    state.rows.forEach((row, index) => {
      const item = visibleItemOf(dir, row, index, state.rows.length, level);
      out.push(item);
      if (row.kind === "dir" && expanded.has(item.rel)) walk(item.rel, level + 1);
    });
  };
  walk("", 1);
  return out;
}
