/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CanvasCellSurface.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useMemo, useRef, useState } from "react";

import type { Block } from "@/entities/block";
import { BlockEditorSurface, type SurfaceBlockEditorProps } from "../../BlockEditorSurface";
import type { LazyMounter } from "../controller/lazyMount";
import { blocksDatabasePreview } from "../model/cellPreview";

interface CanvasCellSurfaceProps {
  pageId: string;
  layoutBlockId: string;
  cellId: string;
  blocks: Block[];
  locked: boolean;
  lazyMounter: LazyMounter;
  renderBlockEditor: (props: SurfaceBlockEditorProps) => React.ReactNode;
}

/**
 * Every cell's nested editor mounts lazily through the stage's shared
 * IntersectionObserver (legacy deferred database cells only); the placeholder
 * keeps the deferred-database data attributes for styling and tests.
 * Memoized so cell-shell re-renders (selection, config changes) never
 * re-render the nested editor subtree — its props are all identity-stable.
 */
const CanvasCellSurfaceComponent: React.FC<CanvasCellSurfaceProps> = ({
  pageId,
  layoutBlockId,
  cellId,
  blocks,
  locked,
  lazyMounter,
  renderBlockEditor,
}) => {
  const [mounted, setMounted] = useState(false);
  const unobserveRef = useRef<(() => void) | null>(null);
  const source = useMemo(
    () => ({ kind: "cell" as const, pageId, layoutBlockId, cellId }),
    [cellId, layoutBlockId, pageId],
  );
  const databasePreview = useMemo(() => (mounted ? null : blocksDatabasePreview(blocks)), [blocks, mounted]);

  const anchorRef = useCallback((node: HTMLDivElement | null) => {
    unobserveRef.current?.();
    unobserveRef.current = null;
    if (!node) return;
    unobserveRef.current = lazyMounter.observe(node, () => setMounted(true));
  }, [lazyMounter]);

  return (
    <div ref={mounted ? undefined : anchorRef} className="osionos-layout-cell-surface-anchor">
      {mounted ? (
        <BlockEditorSurface
          pageId={pageId}
          source={source}
          locked={locked}
          compact
          emptyPlaceholder="Type / for blocks, [[ for pages…"
          renderBlockEditor={renderBlockEditor}
        />
      ) : (
        <div
          className={databasePreview ? "osionos-layout-cell-deferred osionos-database-block osionos-database-block--deferred" : "osionos-layout-cell-deferred"}
          data-database-id={databasePreview?.databaseId}
          data-database-view-id={databasePreview?.viewId}
          data-database-deferred={databasePreview ? "true" : undefined}
          aria-hidden
        />
      )}
    </div>
  );
};

export const CanvasCellSurface = React.memo(CanvasCellSurfaceComponent);
CanvasCellSurface.displayName = "CanvasCellSurface";
