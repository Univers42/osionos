/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SidebarHosts.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import React from "react";

import { useEffectiveSidebarSide } from "@/shared/config/useSidebarSide";
import { ActivitySidebar } from "@/widgets/activity-rail";
import { SidebarEdgePeek } from "@/widgets/activity-rail/ui/SidebarEdgePeek";

interface Props {
  /** The edge of the workbench this instance stands for; it renders only while the side bar is docked there. */
  edge: "left" | "right";
  onOpenSettings: () => void;
}

/**
 * The primary side bar and its hidden-mode edge peek on one edge. App mounts
 * one of these before `<main>` and one after, so the DOM (and the Tab order)
 * follows what the user sees whichever side the bar is on.
 */
export const SidebarHosts: React.FC<Props> = ({ edge, ...handlers }) => {
  if (useEffectiveSidebarSide() !== edge) return null;
  return (
    <>
      <ActivitySidebar {...handlers} />
      <SidebarEdgePeek {...handlers} />
    </>
  );
};
