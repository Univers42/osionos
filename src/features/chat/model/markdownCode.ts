/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   markdownCode.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The code of a markdown source: the fenced blocks and the inline spans.
 *
 * The assistant's answers cite their sources as `[1]`, `[2]`… — but a marker
 * written INSIDE code is not a marker, it is code. This module says where the
 * code is, so the answer can be cut without touching it.
 *
 * Pure logic: it reads the source and returns the ranges that are code.
 */

/** A range of the source that is code. */
export type CodeRange = [start: number, end: number];

/** True when an offset falls inside one of the ranges. */
function inside(offset: number, ranges: CodeRange[]): boolean {
  return ranges.some(([start, end]) => offset >= start && offset < end);
}

/** The fenced code blocks of a markdown source: ``` and ~~~ runs. */
function fencedRegions(text: string): CodeRange[] {
  const regions: CodeRange[] = [];
  const lines = text.split("\n");
  let offset = 0;
  let open: { marker: string; length: number; start: number } | null = null;
  for (const line of lines) {
    const fence = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (open) {
      // The block closes on a fence of the same kind, at least as long.
      if (fence && fence[1][0] === open.marker[0] && fence[1].length >= open.length) {
        regions.push([open.start, offset + line.length]);
        open = null;
      }
    } else if (fence) {
      open = { marker: fence[1], length: fence[1].length, start: offset };
    }
    offset += line.length + 1;
  }
  // A fence that is never closed runs to the end of the answer.
  if (open) regions.push([open.start, text.length]);
  return regions;
}

/** The inline code spans of a markdown source: `like this`. */
function inlineRegions(text: string, skip: CodeRange[]): CodeRange[] {
  const runs: Array<{ start: number; length: number }> = [];
  const pattern = /`+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    runs.push({ start: match.index, length: match[0].length });
  }
  const regions: CodeRange[] = [];
  for (let index = 0; index < runs.length; index += 1) {
    const open = runs[index];
    if (inside(open.start, skip)) continue;
    // A span closes on the next run of the SAME length.
    for (let close = index + 1; close < runs.length; close += 1) {
      const candidate = runs[close];
      if (inside(candidate.start, skip)) continue;
      if (candidate.length !== open.length) continue;
      regions.push([open.start, candidate.start + candidate.length]);
      index = close;
      break;
    }
  }
  return regions;
}

/** Every part of the source that is code: the fenced blocks and the spans. */
export function codeRegions(text: string): CodeRange[] {
  const fenced = fencedRegions(text);
  return [...fenced, ...inlineRegions(text, fenced)];
}
