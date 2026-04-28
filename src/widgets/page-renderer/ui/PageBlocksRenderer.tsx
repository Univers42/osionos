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
import {
  getInternalPageIdFromHref,
  isExternalHref,
  navigateToInternalPage,
} from "@/shared/lib/internalPageNavigation";

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
        if (navigateToInternalPage(internalPageId)) {
          event.preventDefault();
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
  }, []);

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
