/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CellRegionControls.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The inspector's region writers: region, collapse width and stick, each a
// segmented control that dispatches ONE setCellRegion action carrying the
// cell's other two current values, so one undo takes the whole triple back.

import React from "react";

import { normalizeRegion, normalizeStackAt } from "@/entities/block/model/layoutRegion";
import type { CanvasAction, CanvasCell } from "../model/types";
import { CanvasSegmented } from "./CanvasInspectorControls";

/** The cell's region triple with one field swapped; the other two ride along unchanged. */
function setCellRegionAction(cell: CanvasCell, patch: { region?: unknown; stackAt?: unknown; sticky?: unknown }): CanvasAction {
  return { type: "setCellRegion", id: cell.id, region: cell.region, stackAt: cell.stackAt, sticky: cell.sticky, ...patch };
}

export const CellRegionControls: React.FC<{ cell: CanvasCell; dispatch: (action: CanvasAction) => void }> = ({ cell, dispatch }) => {
  const region = normalizeRegion(cell.region);
  return (
    <>
      <CanvasSegmented
        label="Region"
        value={region ?? "none"}
        options={["none", "header", "left", "main", "right", "footer"] as const}
        onChange={(value) => dispatch(setCellRegionAction(cell, { region: value === "none" ? undefined : value }))}
      />
      <CanvasSegmented
        label="Collapse below"
        value={normalizeStackAt(cell.stackAt) ?? "none"}
        options={["none", "tablet", "mobile", "never"] as const}
        onChange={(value) => dispatch(setCellRegionAction(cell, { stackAt: value === "none" ? undefined : value }))}
      />
      {/* CanvasSegmented has no disabled state, so the stick control only exists
          while the region is one of the two it is honoured on. */}
      {region === "left" || region === "right" ? (
        <CanvasSegmented
          label="Stick while scrolling"
          value={cell.sticky === true ? "on" : "off"}
          options={["off", "on"] as const}
          onChange={(value) => dispatch(setCellRegionAction(cell, { sticky: value === "on" }))}
        />
      ) : null}
    </>
  );
};
