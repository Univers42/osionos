/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   buttonEffect.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "./types";
export type RenderMode = "live" | "preview";

export type ButtonEffect = "run-program" | "open-page" | "anchor" | "none";

/** Pure click decision for a read-only button block. A program never runs in a
 *  preview surface; opening a page or following an anchor writes nothing, so
 *  those stay live in both modes. */
export function buttonEffect(
  block: Pick<Block, "buttonProgram" | "buttonHref">,
  mode: RenderMode,
): ButtonEffect {
  if (block.buttonProgram !== undefined) {
    return mode === "preview" ? "none" : "run-program";
  }
  const href = block.buttonHref;
  if (href && href.startsWith("page://")) return "open-page";
  if (href && href.startsWith("/")) return "anchor";
  return "none";
}
