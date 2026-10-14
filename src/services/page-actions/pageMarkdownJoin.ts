/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageMarkdownJoin.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import { isEmptyParagraph } from "./pageMarkdownEscape";

// How sibling blocks are laid out in the Markdown dialect: indentation per
// nesting level and the blank lines between siblings (clipboard vs page file).

/** Indent non-blank lines; "" separators stay bare so levels never collide. O(T). */
export function indentLines(markdown: string, prefix: string): string {
  return markdown.split("\n").map((line) => (line === "" ? "" : `${prefix}${line}`)).join("\n");
}

export const isListItem = (block: Block | undefined): boolean =>
  block?.type === "bulleted_list" || block?.type === "numbered_list" || block?.type === "to_do";

/**
 * Clipboard form: one blank line between siblings (two paragraphs on adjacent
 * lines merge on parse), none between two list items of the same kind so copied
 * lists stay tight. Different kinds keep the blank: "- b" then "- [x] c" on
 * adjacent lines parse as ONE bulleted list and lose the checkbox.
 * O(T): T rendered characters.
 */
export function joinTight(blocks: Block[], render: (block: Block) => string): string {
  let out = "";
  blocks.forEach((block, index) => {
    const previous = blocks[index - 1];
    if (index > 0) out += isListItem(block) && previous?.type === block.type ? "\n" : "\n\n";
    out += render(block);
  });
  return out;
}

/**
 * Page-file form: one blank line between siblings and one more per empty
 * paragraph at its position (leading and trailing ones too), each blank written
 * as `blankLine` so nesting levels never collide. At the top level a trailing
 * empty takes one extra blank: the parser reads the last blank as the file end.
 * O(T): T rendered characters.
 */
export function joinWithEmpties(blocks: Block[], render: (block: Block) => string, blankLine: string): string {
  const topLevel = blankLine === "";
  const solids: string[] = [];
  const gaps: number[] = [];
  let leading = 0;
  let pending = 0;
  for (const block of blocks) {
    if (isEmptyParagraph(block)) {
      pending += 1;
      continue;
    }
    if (solids.length === 0) leading = pending;
    else gaps.push(pending);
    solids.push(render(block));
    pending = 0;
  }
  if (solids.length === 0) return Array.from({ length: blocks.length + 1 }, () => blankLine).join("\n");
  const lines: string[] = Array.from({ length: leading }, () => blankLine);
  solids.forEach((solid, index) => {
    if (index > 0) for (let blank = 0; blank <= (gaps[index - 1] ?? 0); blank++) lines.push(blankLine);
    lines.push(solid);
  });
  const trailing = topLevel && pending > 0 ? pending + 1 : pending;
  for (let blank = 0; blank < trailing; blank++) lines.push(blankLine);
  return lines.join("\n");
}
