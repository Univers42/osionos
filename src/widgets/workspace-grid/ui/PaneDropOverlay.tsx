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

// One box whose inset changes, so motion.css can glide it from zone to zone.
const ZONE_INSET: Record<DropZone, string> = {
  center: "4px",
  left: "4px 50% 4px 4px",
  right: "4px 4px 4px 50%",
  top: "4px 4px 50% 4px",
  bottom: "50% 4px 4px 4px",
};

/** Translucent preview of where a dragged item will land inside a pane. */
export const PaneDropOverlay: React.FC<{ zone: DropZone | null }> = ({ zone }) => {
  if (!zone) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div
        data-drop-zone={zone}
        style={{ inset: ZONE_INSET[zone] }}
        className="osio-drop-zone absolute rounded-[var(--osio-radius-chip)] border-2 border-[var(--osio-accent)] bg-[var(--osio-accent)]/20"
      />
    </div>
  );
};
