/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MediaBlockEditor.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/14 00:00:00 by rstancu          #+#    #+#             */
/*   Updated: 2026/04/14 00:00:00 by rstancu         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useRef, useState } from "react";

import type { Block } from "@/entities/block";
import {
  MEDIA_BLOCK_LABELS,
  isMediaBlockType,
} from "@/entities/block";
import { MediaBlockPreview } from "@/entities/block/ui/MediaBlockPreview";
import { EditableContent } from "@/components/blocks/EditableContent";
import { MediaAssetPicker } from "@/shared/ui/molecules/MediaAssetPicker";
import { usePageStore } from "@/store/usePageStore";

interface MediaBlockEditorProps {
  pageId: string;
  block: Block;
  onChange: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onPaste?: (e: React.ClipboardEvent) => void;
}

export const MediaBlockEditor: React.FC<MediaBlockEditorProps> = ({
  pageId,
  block,
  onChange,
  onKeyDown,
  onPaste,
}) => {
  const updateBlock = usePageStore((state) => state.updateBlock);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const kind = isMediaBlockType(block.type) ? block.type : "image";
  const label = MEDIA_BLOCK_LABELS[kind];

  const handleSelect = useCallback(
    (value: string) => {
      updateBlock(pageId, block.id, { asset: value });
      setShowPicker(false);
    },
    [updateBlock, pageId, block.id],
  );

  useEffect(() => {
    if (!showPicker) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node)
      ) {
        setShowPicker(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowPicker(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showPicker]);

  return (
    <div data-testid="media-block-editor" className="my-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-primary)]">
      <div className="p-3">
        <MediaBlockPreview block={block} />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--color-line)] px-3 py-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
            {label}
          </p>
          <p className="text-xs text-[var(--color-ink-muted)]">
            Library asset
          </p>
        </div>

        <div ref={pickerRef} className="relative">
          <button
            type="button"
            data-testid="media-block-change-asset"
            className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-secondary)]"
            onClick={() => setShowPicker((current) => !current)}
          >
            Change {label.toLowerCase()}
          </button>

          {showPicker && (
            <div
              data-testid="media-block-picker"
              className="absolute right-0 top-full z-50 mt-2 w-[320px] overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-primary)] shadow-2xl"
            >
              <MediaAssetPicker
                kind={kind}
                value={block.asset}
                label={label}
                onSelect={handleSelect}
              />
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-[var(--color-line)] px-3 py-2">
        <EditableContent
          content={block.content}
          className="min-h-[1.5em] text-sm text-[var(--color-ink-muted)] leading-relaxed"
          placeholder="Write a caption..."
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          pageId={pageId}
        />
      </div>
    </div>
  );
};
