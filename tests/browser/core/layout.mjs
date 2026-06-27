/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layout.mjs                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/* global getComputedStyle, localStorage */

/** True when the suite run targets the Canvas V2 layout editor. */
export const isCanvasV2Run = process.env.OSIO_CANVAS_V2 === "1";

/**
 * Pin the osio.canvas.v2 flag for every page of a test. Writing an explicit
 * "0" keeps a stale flag in a reused profile from flipping the legacy run.
 */
export async function setupCanvasFlag(page, enabled = isCanvasV2Run) {
  await page.addInitScript((value) => localStorage.setItem("osio.canvas.v2", value), enabled ? "1" : "0");
}

/**
 * Implementation-agnostic grid position of a layout cell. Canvas V2 cells are
 * absolutely positioned and expose data-layout-col-start/-col-span/... data
 * attributes; legacy cells answer through computed grid styles. Values are
 * only comparable within one implementation (legacy col/row end computes as
 * "span N", V2 reports the numeric line).
 */
export function readCellGrid(cell) {
  return cell.evaluate((node) => {
    const { layoutColStart, layoutColSpan, layoutRowStart, layoutRowSpan } = node.dataset;
    if (layoutColStart !== undefined) {
      return {
        colStart: layoutColStart,
        colEnd: String(Number(layoutColStart) + Number(layoutColSpan ?? 1)),
        rowStart: layoutRowStart ?? "1",
        rowEnd: String(Number(layoutRowStart ?? 1) + Number(layoutRowSpan ?? 1)),
      };
    }
    const style = getComputedStyle(node);
    return {
      colStart: style.gridColumnStart,
      colEnd: style.gridColumnEnd,
      rowStart: style.gridRowStart,
      rowEnd: style.gridRowEnd,
    };
  });
}
