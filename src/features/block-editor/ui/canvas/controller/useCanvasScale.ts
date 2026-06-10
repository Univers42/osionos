/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useCanvasScale.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useLayoutEffect, useRef, type RefObject } from "react";

import { computeScaleX } from "../model/resolveLayout";
import type { CanvasGridConfig } from "../model/types";

/**
 * Fluid-width rendering with zero React work: container resizes write one
 * CSS custom property (`--osio-canvas-sx`) straight to the stage element;
 * cell transforms compose it. The ref carries the live factor for pointer
 * math (screen px -> frame px).
 */
export function useCanvasScale(
  stageRef: RefObject<HTMLElement | null>,
  config: Pick<CanvasGridConfig, "columns" | "columnWidth" | "columnGap">,
): RefObject<number> {
  const scaleRef = useRef(1);
  const { columns, columnWidth, columnGap } = config;

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const apply = () => {
      const scaleX = computeScaleX(stage.clientWidth || 1, { columns, columnWidth, columnGap, rowHeight: 1, rowGap: 0, snapToGrid: false });
      scaleRef.current = scaleX;
      stage.style.setProperty("--osio-canvas-sx", String(scaleX));
    };

    apply();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(apply);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [columnGap, columnWidth, columns, stageRef]);

  return scaleRef;
}
