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

import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
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
}

/**
 * The left sidebar. One container stays mounted across panel<->rail so its width
 * animates (CSS transition) on collapse/expand; during an active drag the width
 * is written straight to the DOM (no transition) and tracks the pointer 1:1 all
 * the way down to the rail width — no snap jump. Below the transition width the
 * content swaps to the icon rail; release there collapses, release wider keeps
 * the panel. From the rail, drag right → expand, drag far left → hide.
 */
export const ActivitySidebar: React.FC<Props> = ({ onOpenSettings, onOpenTrash, onOpenConsole }) => {
  const sidebarMode = useUIStore((s) => s.sidebarMode);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);
  const collapseToRail = useUIStore((s) => s.collapseToRail);
  const expandToPanel = useUIStore((s) => s.expandToPanel);
  const hide = useUIStore((s) => s.hide);
  const sizeRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const previewRef = useRef(false);
  const [previewRail, setPreviewRail] = useState(false);

  const targetWidth = sidebarMode === "rail" ? RAIL_WIDTH : sidebarWidth;

  // Drive width from the DOM (not React's style prop) so a re-render mid-drag
  // can't reset it. For non-drag changes the CSS `transition: width` animates it.
  useLayoutEffect(() => {
    if (sizeRef.current && !draggingRef.current) sizeRef.current.style.width = `${targetWidth}px`;
  }, [targetWidth]);

  const setLive = (px: number) => {
    if (sizeRef.current) sizeRef.current.style.width = `${px}px`;
  };

  // Expanded panel: track 1:1 down to the rail width; preview icons below the threshold.
  const onPanelLive = useCallback((px: number) => {
    setLive(Math.max(RAIL_WIDTH, Math.min(PANEL_MAX_WIDTH, px)));
    const shouldPreview = px < PANEL_TRANSITION_WIDTH;
    if (shouldPreview !== previewRef.current) {
      previewRef.current = shouldPreview;
      setPreviewRail(shouldPreview);
    }
  }, []);
  const onPanelCommit = useCallback(
    (px: number) => {
      draggingRef.current = false;
      previewRef.current = false;
      setPreviewRail(false);
      if (px < PANEL_TRANSITION_WIDTH) collapseToRail();
      else setSidebarWidth(px);
    },
    [collapseToRail, setSidebarWidth],
  );
  const startPanelResize = useSidebarResize({
    getStartWidth: () => {
      draggingRef.current = true;
      return useUIStore.getState().sidebarWidth;
    },
    onLiveWidth: onPanelLive,
    onCommit: onPanelCommit,
  });

  // Rail: drag right past the transition → expand; drag far left → hide.
  const onRailLive = useCallback((px: number) => {
    setLive(Math.max(RAIL_HIDE_WIDTH, Math.min(PANEL_MAX_WIDTH, px)));
  }, []);
  const onRailCommit = useCallback(
    (px: number) => {
      draggingRef.current = false;
      if (px >= PANEL_TRANSITION_WIDTH) {
        setSidebarWidth(px);
        expandToPanel();
      } else if (px < RAIL_HIDE_WIDTH) {
        hide();
      } else {
        setLive(RAIL_WIDTH); // settle back to the rail width with a transition
      }
    },
    [expandToPanel, hide, setSidebarWidth],
  );
  const startRailResize = useSidebarResize({
    getStartWidth: () => {
      draggingRef.current = true;
      return RAIL_WIDTH;
    },
    onLiveWidth: onRailLive,
    onCommit: onRailCommit,
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

  if (sidebarMode === "hidden") return null;

  const showRail = sidebarMode === "rail" || previewRail;
  const startResize = sidebarMode === "rail" ? startRailResize : startPanelResize;

  return (
    <aside className={styles.activitySidebar} aria-label="Sidebar">
      {/* width is driven by useLayoutEffect/drag (DOM), never React's style prop,
          so a re-render mid-drag can't snap it back. */}
      <div ref={sizeRef} className={styles.panel}>
        {showRail ? (
          <ActivityRail onOpenSettings={onOpenSettings} />
        ) : (
          <SidebarPanel onOpenSettings={onOpenSettings} onOpenTrash={onOpenTrash} onOpenConsole={onOpenConsole} />
        )}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        tabIndex={0}
        className={styles.resizeHandle}
        onPointerDown={startResize}
        onKeyDown={onResizeKeyDown}
      />
    </aside>
  );
};
