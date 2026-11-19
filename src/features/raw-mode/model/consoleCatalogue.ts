/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   consoleCatalogue.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// What the Advanced console completes and explains on a `:::` opener (ADR 0064 PS22). Every
// kind, key and value is read off CONTAINER_KINDS, PROP_SCALE and STYLE_SCALES, so a scale
// change reaches the console with no edit here. Plain data: the Monaco adapter maps it.
//
// Caveat: the context is read from the line alone. An opener-shaped line inside fenced code
// or a blockquote still completes, and a `{` the engine would ignore (not at the end of the
// opener) still opens key completion. It only offers text; the diagnostics say what counts.
import { PROP_SCALE, STYLE_SCALES } from "@/entities/block/model/blockStyle";
import { CONTAINER_KINDS, LAYOUT_STYLE_KEYS } from "@/entities/block/model/blockStyleAttributes";

export type ConsoleItemKind = "kind" | "key" | "value";

export interface ConsoleCompletion {
  label: string;
  detail: string;
  kind: ConsoleItemKind;
  /** Keeps the catalogue's order in the widget: layout keys before the rest. */
  sortText: string;
}

/** Items replace the text from `startColumn` (1-based) to the caret. */
export interface ConsoleCompletions {
  startColumn: number;
  items: ConsoleCompletion[];
}

export interface ConsoleHover {
  startColumn: number;
  endColumn: number;
  text: string;
}

type ContainerKind = (typeof CONTAINER_KINDS)[number];
type LayoutKey = (typeof LAYOUT_STYLE_KEYS)[number];

const KIND_DOCS: Readonly<Record<ContainerKind, string>> = {
  columns: "Column list: its `:::column` blocks sit side by side.",
  column: "One column: an optional width ratio, then `{span=n}` inside a grid.",
  row: "Column list laid out as a row (layout=row).",
  stack: "Column list stacked top to bottom (layout=stack).",
  grid: "Column list laid out as a grid (layout=grid); set `cols`.",
  section: "Column list that groups its blocks and implies no layout.",
};

const LAYOUT_KEY_DOCS: Readonly<Record<LayoutKey, string>> = {
  layout: "Container mode of a column list",
  wrap: "Whether a row wraps its columns",
  cols: "Tracks of a grid",
  minCol: "Narrowest grid or wrapped column, in rem",
  stackAt: "Width at which the columns stack",
  span: "Tracks a column covers in a grid",
};

const KIND_PREFIX_RE = /^\s*:::\s*([A-Za-z][\w-]*)?$/;
const BRACE_PREFIX_RE = /^\s*:::\s*[A-Za-z][\w-]*[^{}]*\{([^{}]*)$/;
const LAYOUT_KEYS: ReadonlySet<string> = new Set(LAYOUT_STYLE_KEYS);
const ATTRIBUTE_KEYS = [...LAYOUT_STYLE_KEYS, ...Object.keys(PROP_SCALE).filter((key) => !LAYOUT_KEYS.has(key))];
const EMPTY: ConsoleCompletions = { startColumn: 1, items: [] };

/** The values a key accepts, as typed in an opener; undefined for a key that is not style. */
export function attributeValues(key: string): string[] | undefined {
  if (!Object.hasOwn(PROP_SCALE, key)) return undefined;
  return (STYLE_SCALES[PROP_SCALE[key]] as readonly (string | number)[]).map(String);
}

/** `cols — Tracks of a grid. Values: 1 · 2 · …`: one line. */
export function attributeDoc(key: string): string | undefined {
  const values = attributeValues(key);
  if (values === undefined) return undefined;
  const what = LAYOUT_KEYS.has(key) ? LAYOUT_KEY_DOCS[key as LayoutKey] : `Block style, ${PROP_SCALE[key]} scale`;
  return `\`${key}\` — ${what}. Values: ${values.join(" · ")}`;
}

function item(label: string, detail: string, kind: ConsoleItemKind, index: number): ConsoleCompletion {
  return { label, detail, kind, sortText: String(index).padStart(3, "0") };
}

function attributeCompletions(prefix: string, braceText: string): ConsoleCompletions {
  const token = /[^\s{]*$/.exec(braceText)?.[0] ?? "";
  const equals = token.indexOf("=");
  if (equals < 0) {
    const items = ATTRIBUTE_KEYS.map((key, index) => item(key, attributeDoc(key) ?? "", "key", index));
    return { startColumn: prefix.length - token.length + 1, items };
  }
  const key = token.slice(0, equals);
  const items = (attributeValues(key) ?? []).map((value, index) => item(value, key, "value", index));
  return { startColumn: prefix.length - (token.length - equals - 1) + 1, items };
}

/** What to offer with the caret after `linePrefix` (the line's text up to the caret). O(keys). */
export function consoleCompletions(linePrefix: string): ConsoleCompletions {
  const kind = KIND_PREFIX_RE.exec(linePrefix);
  if (kind !== null) {
    const items = CONTAINER_KINDS.map((name, index) => item(name, KIND_DOCS[name], "kind", index));
    return { startColumn: linePrefix.length - (kind[1]?.length ?? 0) + 1, items };
  }
  const brace = BRACE_PREFIX_RE.exec(linePrefix);
  return brace === null ? EMPTY : attributeCompletions(linePrefix, brace[1]);
}

function wordAt(line: string, column: number): { word: string; start: number } | null {
  const index = column - 1;
  for (const match of line.matchAll(/[A-Za-z][\w-]*/g)) {
    if (match.index <= index && index < match.index + match[0].length) return { word: match[0], start: match.index };
  }
  return null;
}

function hoverText(line: string, word: string, start: number): string | undefined {
  const before = line.slice(0, start);
  if (/^\s*:::\s*$/.test(before)) return Object.hasOwn(KIND_DOCS, word) ? KIND_DOCS[word as ContainerKind] : undefined;
  const isKey = BRACE_PREFIX_RE.test(before) && line[start + word.length] === "=" && /[{\s]$/.test(before);
  return isKey ? attributeDoc(word) : undefined;
}

/** One line on the kind or key under 1-based `column` of an opener line; null elsewhere. */
export function consoleHover(line: string, column: number): ConsoleHover | null {
  const found = wordAt(line, column);
  if (found === null) return null;
  const text = hoverText(line, found.word, found.start);
  if (text === undefined) return null;
  return { startColumn: found.start + 1, endColumn: found.start + found.word.length + 1, text };
}
