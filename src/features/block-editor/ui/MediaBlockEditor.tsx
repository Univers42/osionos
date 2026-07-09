/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MediaBlockEditor.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

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
import { MEDIA_BLOCK_LABELS, isMediaBlockType } from "@/entities/block";
import { MediaBlockPreview, resolveMediaBlockAsset } from "@/entities/block/ui/MediaBlockPreview";
import { EditableContent } from "@/components/blocks/EditableContent";
import { usePageStore } from "@/store/usePageStore";
import { getBlockSurfaceStyle, getBlockTextStyle } from "../model/blockColors";
import { MediaEmbedDialog } from "./MediaEmbedDialog";
import { MediaSettingsBar } from "./media/MediaSettingsBar";
import { ImageHoverToolbar } from "./media/ImageHoverToolbar";
import { ImageFullscreen } from "./media/ImageFullscreen";
import { AltTextDialog } from "./media/AltTextDialog";

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
  const [showSettings, setShowSettings] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [altOpen, setAltOpen] = useState(false);

  const kind = isMediaBlockType(block.type) ? block.type : "image";
  const label = MEDIA_BLOCK_LABELS[kind];
  const mediaWidth = typeof block.mediaWidth === "number" ? block.mediaWidth : 100;
  const hasAsset = Boolean(block.asset);
  const isImage = kind === "image";
  const imageUrl = isImage ? resolveMediaBlockAsset(block)?.url : undefined;
  const altText = block.mediaAlt ?? "";
  const shouldShowSettings = showSettings && hasAsset;
  const hasCaption = block.content.trim().length > 0;
  const showCaption = shouldShowSettings || hasCaption || captionOpen;
  const surfaceStyle = getBlockSurfaceStyle(block);
  const textStyle = getBlockTextStyle(block);

  const handleSelect = useCallback(
    (value: string) => {
      updateBlock(pageId, block.id, { asset: value });
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

  const handleAltSave = useCallback(
    (alt: string) => {
      updateBlock(pageId, block.id, { mediaAlt: alt || undefined });
    },
    [block.id, pageId, updateBlock],
  );

  useEffect(() => {
    if (!showSettings) return undefined;

    const handleMouseDown = (event: MouseEvent) => {
      if (editorRef.current?.contains(event.target as Node)) return;
      setShowSettings(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowSettings(false);
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showSettings]);

  return (
    <div
      ref={editorRef}
      data-testid="media-block-editor"
      className={[
        "group/media relative my-3 rounded-lg transition-colors",
        shouldShowSettings ? "border border-[var(--osio-border-default)]" : "border border-transparent",
      ].join(" ")}
      style={surfaceStyle}
      onFocusCapture={() => { if (hasAsset) setShowSettings(true); }}
    >
      {!hasAsset ? (
        // Empty: the Notion-style void row opens the embed dialog on click.
        <button
          type="button"
          className="block w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]/40"
          aria-label={`Add ${label.toLowerCase()}`}
          onClick={() => setShowEmbed(true)}
        >
          <MediaBlockPreview block={block} />
        </button>
      ) : isImage ? (
        <button
          type="button"
          className="block w-full rounded-lg p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]/30"
          aria-label={`Edit ${label.toLowerCase()}`}
          onClick={() => setShowSettings(true)}
        >
          <MediaBlockPreview block={block} />
        </button>
      ) : (
        <div className="rounded-lg p-2" onPointerDown={() => setShowSettings(true)}>
          <MediaBlockPreview block={block} />
        </div>
      )}
      {isImage && hasAsset ? (
        <ImageHoverToolbar
          pageId={pageId}
          blockId={block.id}
          url={imageUrl}
          altText={altText}
          onCaption={() => setCaptionOpen(true)}
          onFullScreen={() => setFullscreen(true)}
          onReplace={() => setShowEmbed(true)}
          onAltText={() => setAltOpen(true)}
        />
      ) : null}

      {shouldShowSettings ? (
        <MediaSettingsBar
          label={label}
          mediaWidth={mediaWidth}
          onWidthChange={handleWidthChange}
          onChangeAsset={() => setShowEmbed(true)}
        />
      ) : null}
      {showCaption ? (
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

      {showEmbed ? (
        <MediaEmbedDialog kind={kind} onSelect={handleSelect} onClose={() => setShowEmbed(false)} />
      ) : null}
      {fullscreen && imageUrl ? (
        <ImageFullscreen url={imageUrl} alt={altText || label} onClose={() => setFullscreen(false)} />
      ) : null}
      {altOpen ? (
        <AltTextDialog value={altText} onSave={handleAltSave} onClose={() => setAltOpen(false)} />
      ) : null}
    </div>
  );
};
