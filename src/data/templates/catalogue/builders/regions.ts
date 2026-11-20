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
