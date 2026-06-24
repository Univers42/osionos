/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePageRowDnd.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef } from "react";
import { usePageStore } from "@/store/usePageStore";
import { useSidebarTreeDnd, type DropMode } from "../model/sidebarTreeDnd";
import { computeDropMode } from "./pageTreeItem.helpers";

/** Hover-over-a-folder dwell time before it springs open mid-drag. */
const SPRING_OPEN_MS = 650;

interface RowDndArgs {
  pageId: string;
  parentPageId: string | null | undefined;
  workspaceId: string;
  canExpand: boolean;
  expanded: boolean;
  onSpringOpen: () => void;
}

/**
 * Wires one sidebar tree row for HTML5 drag-and-drop. Returns the props to
 * spread on the row plus the live indicator (`inside` tints the row, `before`
 * / `after` draw a same-depth blue line). Dropping re-parents via `movePage`,
 * so the dragged node's whole subtree follows it.
 */
export function usePageRowDnd({ pageId, parentPageId, workspaceId, canExpand, expanded, onSpringOpen }: RowDndArgs) {
  const movePage = usePageStore((s) => s.movePage);
  const draggingId = useSidebarTreeDnd((s) => s.draggingId);
  const dropTargetId = useSidebarTreeDnd((s) => s.dropTargetId);
  const dropMode = useSidebarTreeDnd((s) => s.dropMode);
  const beginDrag = useSidebarTreeDnd((s) => s.beginDrag);
  const endDrag = useSidebarTreeDnd((s) => s.endDrag);
  const setDropTarget = useSidebarTreeDnd((s) => s.setDropTarget);
  const springTimer = useRef<number | null>(null);

  const clearSpring = () => {
    if (springTimer.current !== null) {
      window.clearTimeout(springTimer.current);
      springTimer.current = null;
    }
  };
  useEffect(() => clearSpring, []);

  const isDragging = draggingId === pageId;
  const indicator: DropMode | null = dropTargetId === pageId ? dropMode : null;
  const isInvalidTarget = !draggingId || draggingId === pageId;

  function handleDragOver(e: React.DragEvent<HTMLElement>) {
    if (isInvalidTarget) return;
    if (!e.dataTransfer) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const mode = computeDropMode(e.clientY, e.currentTarget.getBoundingClientRect());
    if (dropTargetId !== pageId || dropMode !== mode) setDropTarget(pageId, mode);
    if (mode === "inside" && canExpand && !expanded) {
      if (springTimer.current === null) {
        springTimer.current = window.setTimeout(() => { clearSpring(); onSpringOpen(); }, SPRING_OPEN_MS);
      }
    } else {
      clearSpring();
    }
  }

  function handleDrop(e: React.DragEvent<HTMLElement>) {
    if (isInvalidTarget) return;
    e.preventDefault();
    e.stopPropagation();
    const mode = computeDropMode(e.clientY, e.currentTarget.getBoundingClientRect());
    const targetParent = mode === "inside" ? pageId : (parentPageId ?? null);
    clearSpring();
    movePage(draggingId!, targetParent, workspaceId);
    endDrag();
  }

  return {
    isDragging,
    indicator,
    dragHandlers: {
      draggable: true as const,
      onDragStart: (e: React.DragEvent<HTMLElement>) => {
        e.stopPropagation();
        if (!e.dataTransfer) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", pageId);
        beginDrag(pageId);
      },
      onDragEnd: () => { clearSpring(); endDrag(); },
    },
    dropHandlers: {
      onDragOver: handleDragOver,
      onDragLeave: () => { clearSpring(); if (dropTargetId === pageId) setDropTarget(null, null); },
      onDrop: handleDrop,
    },
  };
}
