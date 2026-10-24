/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ActivitySidebar.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useUIStore, PANEL_MAX_WIDTH } from "@/shared/config/uiStore";
import { ActivityRail } from "./ActivityRail";
import { SidebarPanel } from "./SidebarPanel";
import { useSidebarResize } from "../model/useSidebarResize";
import { RAIL_WIDTH, PANEL_TRANSITION_WIDTH, RAIL_HIDE_WIDTH } from "../model/railItems";
import styles from "./ActivitySidebar.module.scss";

interface Props {
  onOpenSettings?: () => void;
  onOpenTrash?: () => void;
  onOpenConsole?: () => void;
  /** Rendered as the hidden-mode peek overlay: no resize edge, a pin to dock. */
  peek?: boolean;
}

/**
 * The left sidebar: the activity rail, always there when docked, and the panel
 * beside it. One click on a rail icon switches panel; clicking the active one
 * folds the panel away. Docking changes are instant: animating the width would
 * relayout the editor next to it on every frame.
 *
 * The edge drags: the panel's edge resizes it, and below the transition width
 * folds it to the rail; the rail's edge drags the panel back out, or, pulled
 * far left, hides the sidebar. Widths are written to the DOM during a drag and
 * committed to the store on release.
 */
export const ActivitySidebar: React.FC<Props> = ({ onOpenSettings, onOpenTrash, onOpenConsole, peek = false }) => {
  const sidebarMode = useUIStore((s) => s.sidebarMode);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);
  const collapseToRail = useUIStore((s) => s.collapseToRail);
  const expandToPanel = useUIStore((s) => s.expandToPanel);
  const hide = useUIStore((s) => s.hide);
  const panelRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  // The peek shows the panel whatever mode the docked sidebar was last in.
  const showPanel = peek || sidebarMode === "panel";

  // Mount the panel once and keep it mounted (a folded panel costs no renders).
  const [panelMounted, setPanelMounted] = useState(showPanel);
  if (showPanel && !panelMounted) setPanelMounted(true);
  useEffect(() => {
    if (panelMounted) return undefined;
    // Pre-warm during idle so the FIRST rail→panel expand pays no mount cost.
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(() => setPanelMounted(true));
      return () => cancelIdleCallback(id);
    }
    const timer = setTimeout(() => setPanelMounted(true), 800);
    return () => clearTimeout(timer);
  }, [panelMounted]);

  const panelWidth = showPanel ? sidebarWidth : 0;
  useLayoutEffect(() => {
    if (panelRef.current && !draggingRef.current) panelRef.current.style.width = `${panelWidth}px`;
  }, [panelWidth]);

  const setLivePanel = (px: number) => {
    if (panelRef.current) panelRef.current.style.width = `${Math.max(0, px)}px`;
  };

  // Drag in total-sidebar pixels (rail + panel), the unit the thresholds are in.
  const onLive = useCallback((total: number) => {
    setLivePanel(Math.min(PANEL_MAX_WIDTH, total - RAIL_WIDTH));
  }, []);
  const onCommit = useCallback((total: number) => {
    draggingRef.current = false;
    if (total < RAIL_HIDE_WIDTH) {
      hide();
    } else if (total < PANEL_TRANSITION_WIDTH) {
      collapseToRail();
      setLivePanel(0);
    } else {
      setSidebarWidth(total - RAIL_WIDTH);
      expandToPanel();
    }
  }, [collapseToRail, expandToPanel, hide, setSidebarWidth]);
  const startResize = useSidebarResize({
    getStartWidth: () => {
      draggingRef.current = true;
      return RAIL_WIDTH + (useUIStore.getState().sidebarMode === "panel" ? useUIStore.getState().sidebarWidth : 0);
    },
    onLiveWidth: onLive,
    onCommit,
  });

  const onResizeKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSidebarWidth(useUIStore.getState().sidebarWidth - 16);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setSidebarWidth(useUIStore.getState().sidebarWidth + 16);
      }
    },
    [setSidebarWidth],
  );

  if (sidebarMode === "hidden" && !peek) return null;

  return (
    <aside className={styles.activitySidebar} aria-label="Sidebar" data-sidebar-mode={peek ? "peek" : sidebarMode}>
      <ActivityRail onOpenSettings={onOpenSettings} />
      <div ref={panelRef} className={styles.panel} data-osio-sidebar-card hidden={!showPanel}>
        {panelMounted ? (
          <div className={styles.panelInner} style={{ width: sidebarWidth }}>
            <SidebarPanel onOpenSettings={onOpenSettings} onOpenTrash={onOpenTrash} onOpenConsole={onOpenConsole} peek={peek} />
          </div>
        ) : null}
      </div>
      {peek ? null : (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuemin={RAIL_WIDTH}
          aria-valuemax={RAIL_WIDTH + PANEL_MAX_WIDTH}
          aria-valuenow={Math.round(RAIL_WIDTH + panelWidth)}
          tabIndex={0}
          className={styles.resizeHandle}
          onPointerDown={startResize}
          onKeyDown={onResizeKeyDown}
        />
      )}
    </aside>
  );
};
