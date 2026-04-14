/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageBlocksRenderer.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/08 19:03:43 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef } from "react";
import type { Block } from "@/entities/block";
import { ReadOnlyBlock } from "@/entities/block";
import { usePageStore } from "@/store/usePageStore";

const INTERNAL_PAGE_LINK_PREFIX = "page://";

function getInternalPageIdFromHref(href: string) {
  return href.startsWith(INTERNAL_PAGE_LINK_PREFIX)
    ? href.slice(INTERNAL_PAGE_LINK_PREFIX.length)
    : null;
}

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
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

  let numberedIndex = 0;

  return (
    <div ref={rootRef} className="flex flex-col">
      {blocks.map((block, i) => {
        // Track numbered list index (reset when type changes)
        if (block.type === "numbered_list") {
          numberedIndex++;
        } else {
          numberedIndex = 0;
        }

        const effectiveIndex =
          block.type === "numbered_list" ? numberedIndex - 1 : i;

        return (
          <ReadOnlyBlock key={block.id} block={block} index={effectiveIndex} />
        );
      })}
    </div>
  );
};
