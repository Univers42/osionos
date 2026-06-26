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

import React, { useEffect, useState } from "react";

import type { PageEntry } from "@/entities/page";
import { IconValueView } from "@/shared/ui/atoms/IconValueView";
import { PageBlocksRenderer } from "@/widgets/page-renderer/ui/PageBlocksRenderer";
import { loadPageById } from "./nodePreview";

interface Props {
  /** Resolved page _id (already extracted from the graph NodeId by the host). */
  pageId: string;
  /** Cursor viewport coords; the card is offset + clamped to stay on-screen. */
  x: number;
  y: number;
}

const CARD_W = 360;
const CARD_H = 320;

/**
 * Ctrl+hover content preview for a graph node — a Notion/Obsidian-style peek card.
 * Loads the page (store, else bridge) with its content and renders a compact,
 * fading snippet of the real blocks. Inert to the pointer so it never steals the
 * hover from the canvas; keyed by pageId at the call site, so each node is a fresh
 * mount with no stale content between nodes.
 */
export const NodeHoverPreview: React.FC<Props> = ({ pageId, x, y }) => {
  const [page, setPage] = useState<PageEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    loadPageById(pageId).then((loaded) => {
      if (!alive) return;
      setPage(loaded);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [pageId]);

  const left = Math.max(8, Math.min(x + 18, globalThis.innerWidth - CARD_W - 8));
  const top = Math.max(8, Math.min(y + 18, globalThis.innerHeight - CARD_H - 8));
  const blocks = page && Array.isArray(page.content) ? page.content : [];

  return (
    <div
      role="tooltip"
      style={{ position: "fixed", left, top, width: CARD_W, maxHeight: CARD_H, zIndex: 80 }}
      className="pointer-events-none flex flex-col overflow-hidden rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-[var(--osio-shadow-modal)]"
    >
      <div className="flex items-center gap-2 border-b border-[var(--osio-border-default)] px-4 py-2.5">
        <IconValueView value={page?.icon ?? "icon:file-text"} size={18} className="shrink-0" />
        <span className="truncate text-sm font-semibold text-[var(--osio-fg-strong)]">
          {page?.title || (loading ? "Loading…" : "Untitled")}
        </span>
      </div>
      <div
        className="min-h-0 flex-1 overflow-hidden px-4 py-3 text-sm leading-snug text-[var(--osio-fg-default)]"
        style={{
          maskImage: "linear-gradient(to bottom, black 70%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent)",
        }}
      >
        {blocks.length > 0 ? (
          <PageBlocksRenderer blocks={blocks} />
        ) : (
          <span className="text-[var(--osio-fg-muted)]">{loading ? "Loading…" : "Empty note"}</span>
        )}
      </div>
      <div className="flex items-center gap-1 border-t border-[var(--osio-border-default)] px-4 py-1.5 text-[11px] text-[var(--osio-fg-subtle)]">
        <kbd className="rounded border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-1 font-mono text-[10px]">Ctrl</kbd>
        + click to open
      </div>
    </div>
  );
};
