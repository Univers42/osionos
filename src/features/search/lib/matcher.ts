/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   matcher.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Single source of truth for matching — used identically by find (highlight)
// and replace, so a replace can never diverge from what the user previewed.

export interface MatchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export type BuildResult = { ok: true; regex: RegExp } | { ok: false; error: string };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Compile a global RegExp from the query + flags. Invalid regex → { ok:false }. */
export function buildMatcher(query: string, opts: MatchOptions): BuildResult {
  if (!query) return { ok: false, error: "" };
  let pattern = opts.regex ? query : escapeRegExp(query);
  if (opts.wholeWord) pattern = `\\b(?:${pattern})\\b`;
  const flags = `g${opts.caseSensitive ? "" : "i"}`;
  try {
    return { ok: true, regex: new RegExp(pattern, flags) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid pattern" };
  }
}

export interface RawMatch {
  index: number;
  length: number;
  groups: string[];
  full: string;
}

/** All matches in `text` (capped to bound a pathological regex per field). */
export function findMatches(text: string, regex: RegExp, cap = 200): RawMatch[] {
  const out: RawMatch[] = [];
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    out.push({ index: match.index, length: match[0].length, groups: match.slice(1).map((g) => g ?? ""), full: match[0] });
    if (match[0].length === 0) regex.lastIndex += 1; // never loop on zero-width
    if (out.length >= cap) break;
  }
  return out;
}

/** VSCode-style preserve-case: stamp the hit's case shape onto the replacement. */
function matchCase(source: string, replacement: string): string {
  if (!source) return replacement;
  if (source === source.toUpperCase() && source !== source.toLowerCase()) return replacement.toUpperCase();
  if (source === source.toLowerCase()) return replacement.toLowerCase();
  if (source[0] === source[0].toUpperCase()) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement;
}

/** Expand $1..$99 / $& / $$ in the replacement against a match's capture groups. */
function expand(replacement: string, groups: string[], full: string): string {
  return replacement.replace(/\$(\d{1,2}|&|\$)/g, (_, key: string) =>
    key === "$" ? "$" : key === "&" ? full : groups[Number(key) - 1] ?? "",
  );
}

/** Replace every match in `text`. Returns the new text and the match count. */
export function applyReplace(
  text: string,
  regex: RegExp,
  replacement: string,
  preserveCase: boolean,
): { text: string; count: number } {
  let out = "";
  let last = 0;
  let count = 0;
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    let rep = expand(replacement, match.slice(1).map((g) => g ?? ""), match[0]);
    if (preserveCase) rep = matchCase(match[0], rep);
    out += text.slice(last, match.index) + rep;
    last = match.index + match[0].length;
    count += 1;
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  return { text: out + text.slice(last), count };
}
