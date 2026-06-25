/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   NodeHoverPreview.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect } from "react";

import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { IconValueView } from "@/shared/ui/atoms/IconValueView";
import { PageBlocksRenderer } from "@/widgets/page-renderer/ui/PageBlocksRenderer";

interface Props {
  /** The graph NodeId == the page id. */
  pageId: string;
  /** Cursor viewport coords; the card is offset + clamped to stay on-screen. */
  x: number;
  y: number;
}

const CARD_W = 340;
const CARD_H = 300;

/**
 * Ctrl+hover content preview for a graph node. Reads the page straight from the
 * store (lazily fetching its content if unloaded) and renders a compact, fading
 * snippet of the real blocks — a Notion/Obsidian-style hover card. Inert to the
 * pointer so it never steals the hover from the canvas.
 */
export const NodeHoverPreview: React.FC<Props> = ({ pageId, x, y }) => {
  const page = usePageStore((s) => s.pageById(pageId));
  const fetchPageContent = usePageStore((s) => s.fetchPageContent);
  const jwt = useUserStore((s) => s.activePageJwt() ?? "");

  useEffect(() => {
    // content == null means "unloaded" (an empty page is []). Fetch on demand.
    if (page && page.content == null && jwt) fetchPageContent(pageId, jwt);
  }, [page, jwt, pageId, fetchPageContent]);

  if (!page) return null;

  const left = Math.max(8, Math.min(x + 16, globalThis.innerWidth - CARD_W - 8));
  const top = Math.max(8, Math.min(y + 16, globalThis.innerHeight - CARD_H - 8));
  const blocks = Array.isArray(page.content) ? page.content : [];

  return (
    <div
      role="tooltip"
      style={{ position: "fixed", left, top, width: CARD_W, maxHeight: CARD_H, zIndex: 80 }}
      className="pointer-events-none overflow-hidden rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-4 shadow-[var(--osio-shadow-modal)]"
    >
      <div className="mb-2 flex items-center gap-2">
        <IconValueView value={page.icon ?? "icon:page"} size={18} className="shrink-0" />
        <span className="truncate text-sm font-semibold text-[var(--osio-fg-strong)]">
          {page.title || "Untitled"}
        </span>
      </div>
      <div
        className="overflow-hidden text-sm leading-snug text-[var(--osio-fg-default)]"
        style={{ maxHeight: CARD_H - 64, maskImage: "linear-gradient(to bottom, black 72%, transparent)" }}
      >
        {blocks.length > 0 ? (
          <PageBlocksRenderer blocks={blocks} />
        ) : (
          <span className="text-[var(--osio-fg-muted)]">
            {page.content == null ? "Loading…" : "Empty note"}
          </span>
        )}
      </div>
    </div>
  );
};
