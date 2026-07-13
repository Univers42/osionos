/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   headerCanvas.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/13 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Escape hatch for the "Customize header" feature. An earlier version of it
 * CONVERTED the whole page in place — every block moved into a "Content" cell of
 * a full-page canvas — with no way back, which is how dozens of pages ended up
 * hidden behind the same profile header. These pure helpers are the way back:
 * recognise such a page and pull the real content out again.
 */

import type { Block } from "./types";

/** The ambient video the header preset sets as cover (removal clears it too). */
export const PROFILE_HEADER_COVER_URL =
  "https://images-assets.nasa.gov/video/GSFC_20170419_EarthFleet_m12586_2017/GSFC_20170419_EarthFleet_m12586_2017~medium.mp4";

/**
 * The page content swallowed by a header-canvas conversion: the blocks of the
 * cell labelled "Content". Null when `block` is not such a canvas — a full-page
 * layout WITHOUT a Content cell is someone's real dashboard, never unwrapped.
 */
export function extractHeaderCanvasContent(block: Block | undefined): Block[] | null {
  if (!block || block.type !== "layout" || block.layoutMode !== "full_page") return null;
  const cell = (block.layoutCells ?? []).find(
    (candidate) => (candidate.label ?? "").trim().toLowerCase() === "content",
  );
  return cell ? [...(cell.blocks ?? [])] : null;
}

/** Can "Remove header" act on this page? A header BAND is simply dropped; a
 *  full-page canvas qualifies only when its Content cell can be restored. */
export function isRemovableHeader(content: readonly Block[] | undefined): boolean {
  const first = content?.[0];
  if (!first || first.type !== "layout") return false;
  if (first.layoutRole === "header") return true;
  return content.length === 1 && extractHeaderCanvasContent(first) !== null;
}

/** The page's content with its header removed: band → the rest of the page;
 *  canvas → the Content cell's blocks. Never returns an empty page. */
export function contentWithoutHeader(content: readonly Block[]): Block[] {
  const first = content[0];
  let rest: Block[] = [...content];
  if (first?.type === "layout" && first.layoutRole === "header") {
    rest = content.slice(1);
  } else {
    const extracted = content.length === 1 ? extractHeaderCanvasContent(first) : null;
    if (extracted) rest = extracted;
  }
  if (rest.length === 0) rest = [{ id: crypto.randomUUID(), type: "paragraph", content: "" }];
  return rest;
}
