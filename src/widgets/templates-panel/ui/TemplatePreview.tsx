/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TemplatePreview.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useState } from "react";

import type { Block } from "@/entities/block";
import type { CatalogueCard } from "@/data/templates/catalogue/types";
import { PageBlocksRenderer } from "@/widgets/page-renderer/ui/PageBlocksRenderer";
import { previewCache } from "../model/previewCache";

const PREVIEW_ZOOM = 0.55;

function PreviewBody({ blocks, failed }: { blocks: Block[] | undefined; failed: boolean }): React.ReactElement {
  if (failed) return <p className="text-xs text-[var(--osio-fg-muted)]">Preview unavailable</p>;
  if (blocks === undefined) return <p className="text-xs text-[var(--osio-fg-muted)]">Loading preview…</p>;
  return (
    <div style={{ zoom: PREVIEW_ZOOM }}>
      <PageBlocksRenderer blocks={blocks} />
    </div>
  );
}

function usePreviewBlocks(templateId: string): { blocks: Block[] | undefined; failed: boolean } {
  const [blocks, setBlocks] = useState<Block[] | undefined>(() => previewCache.get(templateId));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (blocks !== undefined) return;
    let alive = true;
    void import("@/data/templates/catalogue")
      .then(({ loadTemplate }) => loadTemplate(templateId))
      .then((source) => {
        if (!source) throw new Error("Template unavailable");
        const content = source.content ?? [];
        previewCache.set(templateId, content);
        if (alive) setBlocks(content);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [blocks, templateId]);
  return { blocks, failed };
}

export function TemplatePreview({ card }: { card: CatalogueCard }): React.ReactElement {
  const { blocks, failed } = usePreviewBlocks(card.id);
  return (
    <div inert aria-hidden="true" data-template-preview={card.id}
      className="pointer-events-none mx-2 mb-2 h-40 overflow-hidden rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-page)] px-3 py-2">
      <PreviewBody blocks={blocks} failed={failed} />
    </div>
  );
}
