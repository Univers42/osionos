/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   outline.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block/model/types";
import { plainTextOfInlineSource } from "@/features/block-editor/model/crossTextOps";

export interface Heading {
  id: string;
  /** The root block holding the heading — what the virtualizer can scroll to. */
  rootId: string;
  /** Enclosing blocks, root first: the ones a jump may have to unfold. */
  ancestors: string[];
  text: string;
  /** 1 = h1 (longest tick) … 3 = h3 (shortest). */
  level: number;
}

/** A heading counts as "being read" once its top is this close to the pane top. */
export const READING_LINE_PX = 96;

const LEVEL: Partial<Record<Block["type"], number>> = { heading_1: 1, heading_2: 2, heading_3: 3 };
const FIELD = "\u0001";
const ENTRY = "\u0002";
const ANCESTOR = "\u0003";

// A toggle styled as a heading is a heading to the reader (Notion lists it too).
const headingLevel = (block: Block): number | undefined =>
  LEVEL[block.type] ??
  (block.type === "toggle" && block.headingLevel && block.headingLevel <= 3 ? block.headingLevel : undefined);

/**
 * The outline as one string, in document order (nested headings included).
 * A primitive is what lets a store selector skip re-rendering on every
 * keystroke: typing in a paragraph leaves the key unchanged.
 */
export const outlineKey = (blocks: readonly Block[] | undefined): string => {
  const entries: string[] = [];
  const walk = (list: readonly Block[], ancestors: string[]) => {
    for (const block of list) {
      const level = headingLevel(block);
      if (level) entries.push([level, block.id, ancestors.join(ANCESTOR), block.content ?? ""].join(FIELD));
      if (block.children?.length) walk(block.children, [...ancestors, block.id]);
    }
  };
  walk(blocks ?? [], []);
  return entries.join(ENTRY);
};

export const headingsFromKey = (key: string): Heading[] =>
  key === ""
    ? []
    : key.split(ENTRY).map((entry) => {
        const [level, id, path, source] = entry.split(FIELD);
        const ancestors = path === "" ? [] : path.split(ANCESTOR);
        return {
          id,
          rootId: ancestors[0] ?? id,
          ancestors,
          level: Number(level),
          text: plainTextOfInlineSource(source).trim() || "Untitled",
        };
      });

/**
 * Index of the heading being read: the last one whose top has crossed the
 * reading line, or the first when none has. At the scroll bottom the last
 * heading wins, because a short final section can never reach the line.
 * `tops` are offsets from the pane's visible top, in document order.
 */
export const activeHeadingIndex = (tops: readonly number[], atBottom: boolean): number => {
  if (tops.length === 0) return -1;
  if (atBottom) return tops.length - 1;
  let active = 0;
  for (let i = 0; i < tops.length; i++) {
    if (tops[i] > READING_LINE_PX) break;
    active = i;
  }
  return active;
};

/**
 * Headings missing from the DOM (NaN) are either off a virtualized page's
 * rendered window, which is contiguous — before the first rendered heading
 * means above the pane, after the last means below — or folded inside a
 * collapsed block, which sits where the heading before it does.
 * Returns null when none is rendered.
 * Caveat: a folded heading after the last rendered one is taken as below the
 * pane even when its fold is on screen, so the spy lights the heading before it.
 */
export const fillUnrenderedTops = (tops: readonly number[]): number[] | null => {
  const first = tops.findIndex((t) => !Number.isNaN(t));
  if (first < 0) return null;
  let last = tops.length - 1;
  while (Number.isNaN(tops[last])) last--;
  const filled: number[] = [];
  for (let i = 0; i < tops.length; i++) {
    if (!Number.isNaN(tops[i])) filled.push(tops[i]);
    else if (i < first) filled.push(-Infinity);
    else if (i > last) filled.push(Infinity);
    else filled.push(filled[i - 1]);
  }
  return filled;
};
