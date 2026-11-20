/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   regions.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";

export type ShellRegion = "header" | "left" | "main" | "right" | "footer";

/** Fill named shell cells without changing the tree returned by the shell. */
export function regionPage(
  shell: () => Block[],
  fills: Partial<Record<ShellRegion, Block[]>>,
): Block[] {
  return shell().map((block) => {
    if (!block.layoutCells) return { ...block };
    const layoutCells = block.layoutCells.map((cell) => {
      const fill = cell.region ? fills[cell.region as ShellRegion] : undefined;
      return fill?.length ? { ...cell, blocks: fill } : { ...cell };
    });
    return { ...block, layoutCells };
  });
}

/** Re-id every block and layout cell as `<prefix>-block-N` / `<prefix>-cell-N` so templates never collide. */
export function scopeIds(blocks: Block[], prefix: string): Block[] {
  let blockNumber = 0;
  let cellNumber = 0;
  const scope = (block: Block): Block => {
    const next = { ...block, id: `${prefix}-block-${++blockNumber}` };
    if (block.children) next.children = block.children.map(scope);
    if (block.layoutCells) next.layoutCells = block.layoutCells.map((cell) => ({
      ...cell, id: `${prefix}-cell-${++cellNumber}`, blocks: cell.blocks.map(scope),
    }));
    return next;
  };
  return blocks.map(scope);
}
