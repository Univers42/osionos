/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   blockSearch.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import { applyReplace, findMatches, type RawMatch } from "./matcher";
import type { BlockMatch } from "../model/resultModel";

const CONTEXT = 32;

function pushMatches(blockId: string, text: string | undefined, regex: RegExp, out: BlockMatch[]): void {
  if (!text) return;
  for (const m of findMatches(text, regex)) {
    out.push({
      blockId,
      before: text.slice(Math.max(0, m.index - CONTEXT), m.index),
      hit: m.full,
      after: text.slice(m.index + m.length, m.index + m.length + CONTEXT),
    });
  }
}

/** Every text match across a page's block tree — content, file names, table
 *  cells, layout-cell text, and nested children/layout-cell blocks. Mirrors
 *  the fields replaceInBlocks rewrites, so find and replace stay in lockstep. */
export function findInBlocks(blocks: Block[], regex: RegExp): BlockMatch[] {
  const out: BlockMatch[] = [];
  const walk = (list: Block[]): void => {
    for (const block of list) {
      pushMatches(block.id, block.content, regex, out);
      pushMatches(block.id, block.fileName, regex, out);
      pushMatches(block.id, block.placeholderText, regex, out);
      if (block.tableData) {
        for (const row of block.tableData) for (const cell of row) pushMatches(block.id, cell, regex, out);
      }
      if (block.layoutCells) {
        for (const cell of block.layoutCells) {
          pushMatches(block.id, cell.content, regex, out);
          if (cell.blocks) walk(cell.blocks);
        }
      }
      if (block.children) walk(block.children);
    }
  };
  walk(blocks);
  return out;
}

/** Immutably rewrite every text field in the tree; returns the new tree + count.
 *  (Unused-field branches kept undefined so React.memo sees minimal change.) */
export function replaceInBlocks(
  blocks: Block[],
  regex: RegExp,
  replacement: string,
  preserveCase: boolean,
): { blocks: Block[]; count: number } {
  let count = 0;
  const sub = (text: string): string => {
    const r = applyReplace(text, regex, replacement, preserveCase);
    count += r.count;
    return r.text;
  };
  const mapBlock = (block: Block): Block => {
    const next: Block = { ...block, content: sub(block.content) };
    if (block.fileName !== undefined) next.fileName = sub(block.fileName);
    if (block.placeholderText !== undefined) next.placeholderText = sub(block.placeholderText);
    if (block.tableData) next.tableData = block.tableData.map((row) => row.map((cell) => sub(cell)));
    if (block.layoutCells) {
      next.layoutCells = block.layoutCells.map((cell) => ({
        ...cell,
        content: cell.content !== undefined ? sub(cell.content) : cell.content,
        blocks: cell.blocks ? cell.blocks.map(mapBlock) : cell.blocks,
      }));
    }
    if (block.children) next.children = block.children.map(mapBlock);
    return next;
  };
  return { blocks: blocks.map(mapBlock), count };
}

/** Title matches don't have a block; the engine adds a synthetic title row. */
export function titleMatch(title: string, regex: RegExp): RawMatch[] {
  return findMatches(title, regex);
}
