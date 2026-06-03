/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   RawPreviewPane.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo, useRef } from "react";
import { parseMarkdownToBlocks } from "@/shared/lib/markengine";
import { ReadOnlyBlock } from "@/entities/block/ui";
import type { Block } from "@/entities/block";
import { reconcileBlocks } from "../model/reconcileBlocks";

/**
 * Live rendering of the raw markdown `source` as read-only blocks.
 *
 * `source` is already debounced by the caller, so the heavy parse runs only
 * when typing pauses. `React.memo` lets the parent's per-keystroke re-render
 * skip this pane until the debounced source actually changes.
 *
 * The render itself is kept cheap by `reconcileBlocks`: parseMarkdownToBlocks
 * mints fresh object references (and ids) every call, which would defeat
 * `React.memo(ReadOnlyBlock)` and re-render the whole tree on each update.
 * Reconciling against the previous parse restores stable identity for
 * unchanged blocks, so only the block being edited actually re-renders — and
 * stable ids make safe, non-tearing keys.
 */
function RawPreviewPaneImpl({ source }: Readonly<{ source: string }>) {
  const previousBlocksRef = useRef<Block[]>([]);
  const blocks = useMemo(() => {
    const reconciled = reconcileBlocks(parseMarkdownToBlocks(source), previousBlocksRef.current);
    previousBlocksRef.current = reconciled;
    return reconciled;
  }, [source]);
  return (
    <div className="h-full min-h-0 overflow-auto bg-[var(--osio-bg-page)] px-6 py-4">
      <div className="mx-auto max-w-[820px]">
        {blocks.length === 0 ? (
          <p className="text-sm text-[var(--osio-fg-muted)]">Nothing to preview yet.</p>
        ) : (
          blocks.map((block, index) => <ReadOnlyBlock key={block.id} block={block} index={index} />)
        )}
      </div>
    </div>
  );
}

export const RawPreviewPane = React.memo(RawPreviewPaneImpl);
