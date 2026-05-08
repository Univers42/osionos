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
import { ImagePlus, SlidersHorizontal } from "lucide-react";

import type { Block } from "@/entities/block";
import { MEDIA_BLOCK_LABELS, isMediaBlockType } from "@/entities/block";
import { MediaBlockPreview } from "@/entities/block/ui/MediaBlockPreview";
import { EditableContent } from "@/components/blocks/EditableContent";
import { MediaAssetPicker } from "@/shared/ui/molecules/MediaAssetPicker";
import { usePageStore } from "@/store/usePageStore";
import { getBlockSurfaceStyle, getBlockTextStyle } from "../model/blockColors";

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
  const editorRef = useRef<HTMLDivElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const kind = isMediaBlockType(block.type) ? block.type : "image";
  const label = MEDIA_BLOCK_LABELS[kind];
  const mediaWidth = typeof block.mediaWidth === "number" ? block.mediaWidth : 100;
  const shouldShowSettings = showSettings || !block.asset;
  const hasCaption = block.content.trim().length > 0;
  const surfaceStyle = getBlockSurfaceStyle(block);
  const textStyle = getBlockTextStyle(block);

  const handleSelect = useCallback(
    (value: string) => {
      updateBlock(pageId, block.id, { asset: value });
      setShowPicker(false);
      setShowSettings(false);
    },
    [updateBlock, pageId, block.id],
  );

  const handleWidthChange = useCallback(
    (width: number) => {
      updateBlock(pageId, block.id, { mediaWidth: Math.min(100, Math.max(25, width)) });
    },
    [block.id, pageId, updateBlock],
  );

  useEffect(() => {
    if (!showPicker && !showSettings) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (editorRef.current?.contains(event.target as Node)) return;
      if (pickerRef.current?.contains(event.target as Node)) return;
      setShowPicker(false);
      setShowSettings(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowPicker(false);
        setShowSettings(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showPicker, showSettings]);

  return (
    <div
      ref={editorRef}
      data-testid="media-block-editor"
      className={[
        "my-3 rounded-lg transition-colors",
        shouldShowSettings
          ? "border border-[var(--osio-border-default)]"
          : "border border-transparent",
      ].join(" ")}
      style={surfaceStyle}
      onFocusCapture={() => setShowSettings(true)}
    >
      {kind === "image" ? (
        <button
          type="button"
          className="block w-full rounded-lg p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]/30"
          aria-label={`Select ${label.toLowerCase()}`}
          onClick={() => setShowSettings(true)}
        >
          <MediaBlockPreview block={block} />
        </button>
      ) : (
        <div
          className="rounded-lg p-2"
          onPointerDown={() => setShowSettings(true)}
        >
          <MediaBlockPreview block={block} />
        </div>
      )}

      {shouldShowSettings ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--osio-border-default)] px-3 py-2">
          <div className="flex items-center gap-2 rounded-md border border-[var(--osio-border-default)] px-2 py-1 text-xs text-[var(--osio-fg-muted)]">
            <SlidersHorizontal size={13} />
            <input
              type="range"
              min={25}
              max={100}
              step={5}
              value={mediaWidth}
              aria-label={`${label} width`}
              className="h-1.5 w-24 accent-[var(--osio-accent)]"
              onChange={(event) => handleWidthChange(Number(event.target.value))}
            />
            <span className="w-9 tabular-nums">{mediaWidth}%</span>
          </div>

          {[50, 75, 100].map((width) => (
            <button
              key={width}
              type="button"
              className="rounded-md border border-[var(--osio-border-default)] px-2 py-1 text-xs font-medium text-[var(--osio-fg-default)] transition-colors hover:bg-black/[0.04]"
              onClick={() => handleWidthChange(width)}
            >
              {width}%
            </button>
          ))}

          <div ref={pickerRef} className="relative">
            <button
              type="button"
              data-testid="media-block-change-asset"
              aria-label={`Change ${label.toLowerCase()}`}
              title={`Change ${label.toLowerCase()}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--osio-border-default)] text-[var(--osio-fg-default)] transition-colors hover:bg-black/[0.04]"
              onClick={() => setShowPicker((current) => !current)}
            >
              <ImagePlus size={15} />
            </button>

            {showPicker && (
              <div
                data-testid="media-block-picker"
                className="absolute right-0 top-full z-[var(--osio-z-popover)] mt-2 w-[320px] overflow-hidden rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-2xl"
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
      ) : null}

      {shouldShowSettings || hasCaption ? (
        <div className="border-t border-[var(--osio-border-default)] px-3 py-2">
          <EditableContent
            content={block.content}
            className="min-h-[1.5em] text-sm leading-relaxed text-[var(--osio-fg-muted)]"
            style={textStyle}
            placeholder="Write a caption..."
            onChange={onChange}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            pageId={pageId}
          />
        </div>
      ) : null}
    </div>
  );
};