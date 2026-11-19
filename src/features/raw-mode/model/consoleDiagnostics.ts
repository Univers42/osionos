/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   consoleDiagnostics.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Advanced console's diagnostics: what the save would drop, on the line that wrote it
// (ADR 0064 PS23). The drops come from the save's own path, parseRawSource then
// resolveContainerAttributes; nothing here decides what is valid.
//
// The engine keeps no source positions, so an opener's line is found by asking the engine
// again: each `:::` line is parsed alone, and the attributed blocks (in pre-order, which is
// source order) take, in turn, the next line whose attributes are equal to theirs.
// Caveat: an opener-shaped line that is not an opener (inside fenced code) and carries the
// same kind and attributes as a later real opener takes that opener's marker; the message is
// right, the line is the earlier one. An opener whose line does not start with `:::` (inside
// a callout, `> ::: grid`, or on a list marker, `- ::: grid`) is not found: its drops show on
// line 1, marked "line unknown". Nothing is hidden; only the position is lost.
import type { Block } from "@/entities/block";
import { isEngineAttributes, resolveContainerAttributes, type ContainerAttributeDrop, type EngineAttributes } from "@/features/page-file/model/containerStyle";
import { attributeValues } from "./consoleCatalogue";
import { parseRawSource } from "./rawSave";

/** 1-based, end column exclusive, as an editor marker wants it. */
export interface ConsoleDiagnostic {
  line: number;
  startColumn: number;
  endColumn: number;
  message: string;
}

interface Opener {
  attributes: EngineAttributes;
  /** 0-based line index, -1 when not found. */
  line: number;
}

const ENGINE_REPORTS: Readonly<Record<string, string>> = {
  length: "The attributes are too long: the rest is ignored.",
  pairs: "Too many attributes: the rest are ignored.",
  malformed: "A token is not key=value: it is ignored.",
  duplicate: "A key is set twice: the second is ignored.",
};

function collectOpeners(blocks: readonly Block[], out: Map<string, Opener>): Map<string, Opener> {
  for (const block of blocks) {
    if (isEngineAttributes(block.containerAttributes)) out.set(block.id, { attributes: block.containerAttributes, line: -1 });
    if (block.children !== undefined) collectOpeners(block.children, out);
  }
  return out;
}

function sameAttributes(a: unknown, b: EngineAttributes): boolean {
  if (!isEngineAttributes(a) || a.kind !== b.kind || a.dropped.join() !== b.dropped.join()) return false;
  const keys = Object.keys(a.values);
  return keys.length === Object.keys(b.values).length && keys.every((key) => Object.hasOwn(b.values, key) && a.values[key] === b.values[key]);
}

/** O(L) single-line parses, then O(A·L) comparisons at worst (an opener that is never found). */
function locateOpeners(lines: readonly string[], openers: Map<string, Opener>): void {
  const alone = lines.map((line) => (line.trimStart().startsWith(":::") ? parseRawSource(`${line.trimStart()}\n:::`)[0]?.containerAttributes : undefined));
  let cursor = 0;
  for (const opener of openers.values()) {
    for (let index = cursor; index < lines.length; index++) {
      if (alone[index] === undefined || !sameAttributes(alone[index], opener.attributes)) continue;
      opener.line = index;
      cursor = index + 1;
      break;
    }
  }
}

/** The `key=value` token a keyed drop names, else the `{…}` span, else the trimmed line. */
function dropColumns(line: string, key: string | undefined): [number, number] {
  const open = line.lastIndexOf("{");
  const close = line.lastIndexOf("}");
  if (open < 0 || close < open) return [line.length - line.trimStart().length + 1, Math.max(line.length, 1) + 1];
  for (const token of line.slice(open + 1, close).matchAll(/[^\s{}]+/g)) {
    if (key !== undefined && token[0].startsWith(`${key}=`)) return [open + token.index + 2, open + token.index + token[0].length + 2];
  }
  return [open + 1, close + 2];
}

function dropMessage(drop: ContainerAttributeDrop, kind: string): string {
  const key = drop.key ?? "";
  if (drop.reason === "unknown") return `Unknown key \`${key}\`: it is not a style key, so it is dropped.`;
  if (drop.reason === "value") return `\`${key}\` takes ${(attributeValues(key) ?? []).join(" · ")}: this value is dropped.`;
  if (drop.reason === "kind") return `\`::: ${kind}\` sets layout=${kind}: this \`layout\` is dropped.`;
  return Object.hasOwn(ENGINE_REPORTS, drop.reason) ? ENGINE_REPORTS[drop.reason] : `Dropped (${drop.reason}).`;
}

function toDiagnostic(drop: ContainerAttributeDrop, lines: readonly string[], openers: Map<string, Opener>): ConsoleDiagnostic {
  const opener = openers.get(drop.blockId);
  const message = dropMessage(drop, opener?.attributes.kind ?? "");
  if (opener === undefined || opener.line < 0) {
    return { line: 1, startColumn: 1, endColumn: Math.max(lines[0].length, 1) + 1, message: `(line unknown) ${message}` };
  }
  const [startColumn, endColumn] = dropColumns(lines[opener.line], drop.key);
  return { line: opener.line + 1, startColumn, endColumn, message };
}

/** Every attribute the save of `source` would drop, in source order. */
export function consoleDiagnostics(source: string): ConsoleDiagnostic[] {
  const parsed = parseRawSource(source);
  const { dropped } = resolveContainerAttributes(parsed);
  if (dropped.length === 0) return [];
  const openers = collectOpeners(parsed, new Map());
  const lines = source.split("\n");
  locateOpeners(lines, openers);
  const found = dropped.map((drop) => toDiagnostic(drop, lines, openers));
  return found.sort((a, b) => a.line - b.line || a.startColumn - b.startColumn);
}
