/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageBlocksRenderer.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/13 13:52:58 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Block } from "@/entities/block";
import { ReadOnlyBlock } from "@/entities/block";
import {
  createRootBlockRenderMeta,
  estimateBlockHeight,
  ROOT_BLOCK_VIRTUALIZATION_OVERSCAN,
  ROOT_BLOCK_VIRTUALIZATION_THRESHOLD,
} from "@/entities/block/model/blockVirtualization";
import { usePageStore } from "@/store/usePageStore";
import { mark, measure } from "@/shared/lib/perf/measure";

const INTERNAL_PAGE_LINK_PREFIX = "page://";

function getInternalPageIdFromHref(href: string) {
  return href.startsWith(INTERNAL_PAGE_LINK_PREFIX)
    ? href.slice(INTERNAL_PAGE_LINK_PREFIX.length)
    : null;
}

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}

function resolveScrollElement(root: HTMLElement | null): HTMLElement | null {
  return root?.closest<HTMLElement>(".osionos-page") ?? null;
}

function measureScrollMargin(root: HTMLElement, scrollElement: HTMLElement): number {
  const rootRect = root.getBoundingClientRect();
  const scrollRect = scrollElement.getBoundingClientRect();
  return Math.max(0, rootRect.top - scrollRect.top + scrollElement.scrollTop);
}

interface PageBlocksRendererProps {
  blocks: Block[];
}

/**
 * Renders an array of Block objects as read-only HTML.
 * Tracks numbered list indices correctly (resets when a non-numbered block appears).
 */
export const PageBlocksRenderer: React.FC<PageBlocksRendererProps> = ({
  blocks,
}) => {
  const openPage = usePageStore((s) => s.openPage);
  const pageById = usePageStore((s) => s.pageById);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const renderIndexRef = useRef(0);
  const renderStartMarkRef = useRef("");
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  renderIndexRef.current += 1;
  renderStartMarkRef.current = `PageBlocksRenderer:render:${renderIndexRef.current}:start`;
  mark(renderStartMarkRef.current);
  const renderMeta = useMemo(() => createRootBlockRenderMeta(blocks), [blocks]);
  const shouldVirtualize = blocks.length >= ROOT_BLOCK_VIRTUALIZATION_THRESHOLD;
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? renderMeta.length : 0,
    getScrollElement: () => scrollElement,
    estimateSize: (index) => estimateBlockHeight(renderMeta[index]?.block ?? blocks[0]),
    getItemKey: (index) => renderMeta[index]?.block.id ?? index,
    overscan: ROOT_BLOCK_VIRTUALIZATION_OVERSCAN,
    scrollMargin,
  });

  useLayoutEffect(() => {
    if (!shouldVirtualize) return;
    const root = rootRef.current;
    const nextScrollElement = resolveScrollElement(root);
    if (!root || !nextScrollElement) return;

    const updateScrollMargin = () => {
      setScrollElement(nextScrollElement);
      setScrollMargin(measureScrollMargin(root, nextScrollElement));
    };

    updateScrollMargin();
    const resizeObserver = new ResizeObserver(updateScrollMargin);
    resizeObserver.observe(root);
    resizeObserver.observe(nextScrollElement);
    globalThis.addEventListener("resize", updateScrollMargin);
    return () => {
      resizeObserver.disconnect();
      globalThis.removeEventListener("resize", updateScrollMargin);
    };
  }, [blocks.length, shouldVirtualize]);

  useLayoutEffect(() => {
    const endMark = `${renderStartMarkRef.current}:commit`;
    mark(endMark);
    measure(`PageBlocksRenderer.render.${blocks.length}`, renderStartMarkRef.current, endMark);
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || !root.contains(anchor)) {
        return;
      }

      const href = anchor.getAttribute("href") ?? "";
      const internalPageId = getInternalPageIdFromHref(href);
      if (internalPageId) {
        const linkedPage = pageById(internalPageId);
        if (linkedPage) {
          event.preventDefault();
          openPage({
            id: linkedPage._id,
            workspaceId: linkedPage.workspaceId,
            kind: linkedPage.databaseId ? "database" : "page",
            title: linkedPage.title,
            icon: linkedPage.icon,
          });
        }
        return;
      }

      if (isExternalHref(href)) {
        event.preventDefault();
        globalThis.open(anchor.href, "_blank", "noopener,noreferrer");
      }
    };

    root.addEventListener("click", handleClick);
    return () => root.removeEventListener("click", handleClick);
  }, [openPage, pageById]);

  if (shouldVirtualize) {
    return (
      <div ref={rootRef} className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = renderMeta[virtualItem.index];
          if (!item) return null;

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 right-0 top-0"
              style={{ transform: `translateY(${virtualItem.start - scrollMargin}px)` }}
            >
              <ReadOnlyBlock block={item.block} index={item.effectiveIndex} />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="flex flex-col">
      {renderMeta.map((item) => (
        <ReadOnlyBlock key={item.block.id} block={item.block} index={item.effectiveIndex} />
      ))}
    </div>
  );
};
