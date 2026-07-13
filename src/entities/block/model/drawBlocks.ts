/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   drawBlocks.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "./types";

/** Default canvas height of a `draw` block, in px. */
export const DRAW_BLOCK_DEFAULT_HEIGHT = 420;

/** A fresh `draw` block. `content` holds the `.osidraw` JSON scene — empty means
 *  a blank canvas (`loadScene("")` returns false and leaves the fresh scene), so
 *  no sentinel is needed. Storing the scene in `content` is what makes the block
 *  persist through the ordinary page-save path — no extra table or route. */
export function createDefaultDrawBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: crypto.randomUUID(),
    type: "draw",
    content: "",
    drawHeight: DRAW_BLOCK_DEFAULT_HEIGHT,
    ...overrides,
  };
}
