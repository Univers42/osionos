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
import { usePageStore } from "@/store/usePageStore";
import { getBlockSurfaceStyle, getBlockTextStyle } from "../model/blockColors";
import { MediaEmbedDialog } from "./MediaEmbedDialog";
import { MediaSettingsBar } from "./media/MediaSettingsBar";
import { MediaCaption } from "./media/MediaCaption";
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

  const handleAspectChange = useCallback(
    (aspect: string) => {
      updateBlock(pageId, block.id, { mediaAspect: aspect === "original" ? undefined : aspect });
    },
    [block.id, pageId, updateBlock],
  );

  const handleAltSave = useCallback(
    (alt: string) => {
      updateBlock(pageId, block.id, { mediaAlt: alt || undefined });
    },
    [block.id, pageId, updateBlock],
  );

  // Dismiss the settings bar on a click/Escape OUTSIDE the block — but stay armed
  // only while this block's own embed dialog is CLOSED. MediaEmbedDialog portals to
  // document.body, so every click inside it (and the Escape that closes it) reads as
  // "outside" to editorRef and would tear down the very settings bar the user opened
  // the picker from — the picker would close onto a block with no Change-asset
  // affordance. While `showEmbed` is up, the dialog owns the interaction.
  useEffect(() => {
    if (!showSettings || showEmbed) return undefined;

    const handleMouseDown = (event: MouseEvent) => {
      if (editorRef.current?.contains(event.target as Node)) return;
      const target = event.target;
      // A modal surface is never "outside": the backdrop mousedown that closes the
      // embed dialog re-mounts this listener mid-dispatch and then reaches it, which
      // would tear the settings bar down along with the dialog.
      if (target instanceof Element && target.closest("[data-modal-overlay]")) return;
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
  }, [showSettings, showEmbed]);

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
          mediaAspect={isImage ? block.mediaAspect ?? "original" : undefined}
          onAspectChange={isImage ? handleAspectChange : undefined}
        />
      ) : null}
      {showCaption ? (
        <MediaCaption
          content={block.content}
          style={textStyle}
          pageId={pageId}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          autoFocus={captionOpen}
        />
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
