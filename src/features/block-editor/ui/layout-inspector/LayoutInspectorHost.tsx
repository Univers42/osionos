/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LayoutInspectorHost.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Layout popover of one editor surface, anchored to the block's handle.
// Each choice is one commit, so one undo step that publishes like any edit.

import React, { useCallback, useEffect, useRef, useState } from "react";

import type { Block } from "@/entities/block";
import { findBlockInTree } from "@/entities/block";
import { Popover } from "@/shared/ui";
import { LAYOUT_INSPECTOR_EVENT, type LayoutInspectorRequest } from "../../model/layoutContextMenuSection";
import { applyLayoutChoice, resetLayout } from "../../model/layoutInspector";
import { LayoutInspectorPanel } from "./LayoutInspectorPanel";
import type { LayoutChoiceHandler } from "./LayoutControlField";

interface HostProps {
  sourceKey: string;
  blocks: Block[];
  /** The committed tree with every pending draft flushed into it. */
  readContent: () => Block[];
  /** Replaces the tree as one undo step. */
  onCommit: (blocks: Block[]) => void;
}

function blockHandle(blockId: string): HTMLElement | null {
  const article = document.querySelector<HTMLElement>(`[data-draggable-block-id="${CSS.escape(blockId)}"]`);
  return article?.querySelector<HTMLElement>(':scope > [data-testid="block-drag-handle"]') ?? article;
}

/** Focus goes back to the handle unless the click that closed the popover put it elsewhere. */
function returnFocus(handle: HTMLElement | null) {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (handle?.isConnected && (!active || active === document.body)) handle.focus();
  });
}

function useInspectorTarget(sourceKey: string, anchorRef: React.RefObject<HTMLElement | null>) {
  const [targetId, setTargetId] = useState<string | null>(null);
  useEffect(() => {
    const open = (event: Event) => {
      const request = (event as CustomEvent<LayoutInspectorRequest>).detail;
      if (request?.sourceKey !== sourceKey) return;
      anchorRef.current = blockHandle(request.blockId);
      setTargetId(request.blockId);
    };
    globalThis.addEventListener(LAYOUT_INSPECTOR_EVENT, open);
    return () => globalThis.removeEventListener(LAYOUT_INSPECTOR_EVENT, open);
  }, [anchorRef, sourceKey]);
  return [targetId, setTargetId] as const;
}

export function LayoutInspectorHost({ sourceKey, blocks, readContent, onCommit }: Readonly<HostProps>) {
  const anchorRef = useRef<HTMLElement | null>(null);
  const [targetId, setTargetId] = useInspectorTarget(sourceKey, anchorRef);
  const block = targetId ? findBlockInTree(blocks, targetId) : null;

  const close = useCallback(() => {
    setTargetId(null);
    returnFocus(anchorRef.current);
  }, [setTargetId]);
  const choose = useCallback<LayoutChoiceHandler>((control, value) => {
    const current = readContent();
    const next = applyLayoutChoice(current, control.targetId, control.key, value);
    if (next !== current) onCommit(next);
  }, [onCommit, readContent]);
  const reset = useCallback(() => {
    if (targetId) onCommit(resetLayout(readContent(), targetId));
  }, [onCommit, readContent, targetId]);

  return (
    <Popover anchorRef={anchorRef} open={Boolean(block)} onClose={close}>
      {block ? <LayoutInspectorPanel block={block} onChoose={choose} onReset={reset} /> : null}
    </Popover>
  );
}
