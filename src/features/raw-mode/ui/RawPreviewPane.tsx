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

import React, { useMemo } from "react";
import { parseMarkdownToBlocks } from "@/shared/lib/markengine";
import { ReadOnlyBlock } from "@/entities/block/ui";

/**
 * Live rendering of the raw markdown `source` as read-only blocks.
 *
 * `source` is already debounced by the caller, so the heavy parse/render runs
 * only when typing pauses. `React.memo` lets the parent's per-keystroke
 * re-render skip this pane until the debounced source actually changes, and
 * stable index keys avoid remounting every block — parseMarkdownToBlocks mints
 * fresh ids each call, so id-based keys would tear the whole tree down.
 */
function RawPreviewPaneImpl({ source }: Readonly<{ source: string }>) {
  const blocks = useMemo(() => parseMarkdownToBlocks(source), [source]);
  return (
    <div className="h-full min-h-0 overflow-auto bg-[var(--osio-bg-page)] px-6 py-4">
      <div className="mx-auto max-w-[820px]">
        {blocks.length === 0 ? (
          <p className="text-sm text-[var(--osio-fg-muted)]">Nothing to preview yet.</p>
        ) : (
          blocks.map((block, index) => <ReadOnlyBlock key={index} block={block} index={index} />)
        )}
      </div>
    </div>
  );
}

export const RawPreviewPane = React.memo(RawPreviewPaneImpl);
