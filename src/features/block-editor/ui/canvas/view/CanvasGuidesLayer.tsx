/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CanvasGuidesLayer.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { useStore } from "zustand";

import type { CanvasInteractionStore } from "../controller/interactionStore";

/**
 * Alignment guides + marquee rectangle. The only components that re-render
 * per gesture frame — cells never do. Horizontal guide positions compose the
 * stage scale factor in CSS, so the math stays in frame space.
 */
export const CanvasGuidesLayer: React.FC<{ interaction: CanvasInteractionStore }> = ({ interaction }) => {
  const guides = useStore(interaction, (state) => state.guides);
  const marquee = useStore(interaction, (state) => state.marquee);

  return (
    <>
      {guides.map((guide) => (
        <div
          key={`${guide.axis}-${guide.kind}-${guide.value}`}
          className={`osionos-layout-alignment-guide osionos-layout-alignment-guide--${guide.axis}`}
          data-guide-kind={guide.kind}
          style={guide.axis === "x"
            ? { left: `calc(var(--osio-canvas-sx, 1) * ${guide.value}px)` }
            : { top: `${guide.value}px` }}
        />
      ))}
      {marquee ? (
        <div
          className="osio-canvas-v2-marquee"
          style={{
            left: `calc(var(--osio-canvas-sx, 1) * ${marquee.x}px)`,
            top: `${marquee.y}px`,
            width: `calc(var(--osio-canvas-sx, 1) * ${marquee.width}px)`,
            height: `${marquee.height}px`,
          }}
        />
      ) : null}
    </>
  );
};
