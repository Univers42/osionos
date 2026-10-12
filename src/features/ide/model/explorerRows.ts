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
//
// Each name is encoded ONCE into a key whose plain code-unit order IS that natural order, so
// the sort compares native strings and allocates nothing (tests/bench/explorer-rows, p95 for
// 1 000 entries: 19.4 ms splitting per comparison → 0.42 ms encoded). A text run ends in "\0" (below every character a name
// holds, so "ab" sorts before "abc…"); a digit run becomes [1+len(value)][value][1+len(raw)]:
// a longer value sorts after, equal-length values compare digit by digit (exact at any length,
// unlike Number()), and at equal value fewer leading zeros sort first.
const ZERO = 48;
const NINE = 57;

function isDigit(code: number): boolean {
  return code >= ZERO && code <= NINE;
}

function encodeDigitRun(raw: string): string {
  let skip = 0;
  while (skip < raw.length - 1 && raw.charCodeAt(skip) === ZERO) skip += 1;
  const value = raw.slice(skip);
  return String.fromCharCode(1 + value.length) + value + String.fromCharCode(1 + raw.length);
}

/** O(length of name). */
export function naturalKey(name: string): string {
  const lower = name.toLowerCase();
  let key = "";
  let i = 0;
  while (i < lower.length) {
    const textStart = i;
    while (i < lower.length && !isDigit(lower.charCodeAt(i))) i += 1;
    key += `${lower.slice(textStart, i)}\0`;
    const runStart = i;
    while (i < lower.length && isDigit(lower.charCodeAt(i))) i += 1;
    if (i > runStart) key += encodeDigitRun(lower.slice(runStart, i));
  }
  return key;
}

type KeyedRow = { row: ExplorerRow; key: string };

const byKey = (a: KeyedRow, b: KeyedRow): number =>
  a.key < b.key ? -1 : a.key > b.key ? 1 : a.row.name < b.row.name ? -1 : a.row.name > b.row.name ? 1 : 0;

/** O(total name length) to encode + O(n log n) native string comparisons. */
function sortNatural(rows: readonly ExplorerRow[]): ExplorerRow[] {
  return rows.map((row) => ({ row, key: naturalKey(row.name) })).sort(byKey).map((keyed) => keyed.row);
}

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
  return sortNatural(dirs).concat(sortNatural(files));
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
