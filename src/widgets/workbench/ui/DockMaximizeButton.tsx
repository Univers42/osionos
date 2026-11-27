/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DockMaximizeButton.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import React from "react";
import { ChevronDown, ChevronUp, Maximize2, Minimize2 } from "lucide-react";

import { useMediaQuery } from "@/shared/config/useMediaQuery";
import { PHONE_QUERY } from "@/shared/config/useResponsiveSidebar";
import { Tooltip } from "@/shared/ui";
import type { DockPosition } from "@/widgets/workbench/model/workbenchLayout";
import { useWorkbenchStore } from "@/widgets/workbench/model/workbenchStore";
import { ICON_BTN } from "./dockIconButton";

/** The dock header's "Maximize panel size" chevron, VS Code's: up and down for the bottom panel,
 *  the expand and shrink arrows for a side one. It is not drawn on a phone, where the dock is
 *  already the whole screen's width and the menu row stays the one way to maximize it. */
export const DockMaximizeButton: React.FC<{ position: DockPosition }> = ({ position }) => {
  const maximized = useWorkbenchStore((s) => s.dockMaximized);
  const toggle = useWorkbenchStore((s) => s.toggleDockMaximized);
  const phone = useMediaQuery(PHONE_QUERY);
  if (phone) return null;
  const label = maximized ? "Restore panel size" : "Maximize panel size";
  const bottom = position === "bottom";
  const Icon = bottom ? (maximized ? ChevronDown : ChevronUp) : maximized ? Minimize2 : Maximize2;

  return (
    <Tooltip label={label} side="bottom">
      <button type="button" aria-label={label} aria-pressed={maximized} onClick={toggle} className={ICON_BTN}>
        <Icon size={14} aria-hidden="true" />
      </button>
    </Tooltip>
  );
};
