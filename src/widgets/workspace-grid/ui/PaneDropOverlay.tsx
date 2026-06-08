/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PaneDropOverlay.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import type { DropZone } from "../model/paneDropZone";

const ZONE_BOX: Record<DropZone, string> = {
  center: "inset-0",
  left: "left-0 top-0 bottom-0 w-1/2",
  right: "right-0 top-0 bottom-0 w-1/2",
  top: "left-0 right-0 top-0 h-1/2",
  bottom: "left-0 right-0 bottom-0 h-1/2",
};

/** Translucent preview of where a dragged item will land inside a pane. */
export const PaneDropOverlay: React.FC<{ zone: DropZone | null }> = ({ zone }) => {
  if (!zone) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div
        className={[
          "absolute rounded-sm border-2 border-[var(--osio-accent)] bg-[var(--osio-accent)]/20 transition-all duration-75",
          ZONE_BOX[zone],
        ].join(" ")}
      />
    </div>
  );
};
