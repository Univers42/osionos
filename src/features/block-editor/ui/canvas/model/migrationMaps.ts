/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   migrationMaps.ts                                    :+:      :+:    :+:  */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { LayoutCell } from "@/entities/block";
import type { CanvasCell, CanvasSizing } from "./types";

// Legacy `sizing` and the constraint pair are mapped independently so every
// legacy combination (e.g. sizing "fixed" + verticalConstraint "hug")
// round-trips bijectively through the canvas model.

export function sizingFromLegacy(sizing: LayoutCell["sizing"]): CanvasSizing {
  return {
    width: sizing === "auto-width" || sizing === "auto" ? "hug" : "fixed",
    height: sizing === "auto-height" || sizing === "auto" ? "hug" : "fixed",
  };
}

export function legacySizingFromCanvas(sizing: CanvasSizing): NonNullable<LayoutCell["sizing"]> {
  if (sizing.width === "hug" && sizing.height === "hug") return "auto";
  if (sizing.width === "hug") return "auto-width";
  if (sizing.height === "hug") return "auto-height";
  return "fixed";
}

export function migrateHorizontalConstraint(value: LayoutCell["horizontalConstraint"]): CanvasCell["constraints"]["horizontal"] {
  if (value === "stretch") return "min-max";
  if (value === "scale") return "scale";
  return "min";
}

export function migrateVerticalConstraint(value: LayoutCell["verticalConstraint"]): CanvasCell["constraints"]["vertical"] {
  if (value === "stretch") return "min-max";
  if (value === "hug") return "hug";
  return "min";
}

export function unmigrateHorizontalConstraint(value: CanvasCell["constraints"]["horizontal"]): LayoutCell["horizontalConstraint"] {
  if (value === "min-max") return "stretch";
  if (value === "scale") return "scale";
  return "left";
}

export function unmigrateVerticalConstraint(value: CanvasCell["constraints"]["vertical"]): LayoutCell["verticalConstraint"] {
  if (value === "min-max") return "stretch";
  if (value === "hug") return "hug";
  return "top";
}
