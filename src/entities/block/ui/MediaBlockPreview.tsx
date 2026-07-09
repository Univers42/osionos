/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MediaBlockPreview.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/14 00:00:00 by rstancu           #+#    #+#             */
/*   Updated: 2026/05/08 04:43:11 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { AssetRenderer } from "@univers42/ui-collection";
import { FileText, ImageIcon, Music, Play } from "lucide-react";

import {
  MEDIA_BLOCK_LABELS,
  isMediaBlockType,
  type Block,
  type MediaBlockType,
} from "@/entities/block";
import {
  getSlashMediaPickerTabs,
  type ResolvedCollectionMediaAsset,
  resolveCollectionMediaAsset,
} from "@/shared/lib/markengine/uiCollectionAssets";

interface MediaBlockPreviewProps {
  block: Block;
}

export function resolveMediaBlockAsset(
  block: Block,
): ResolvedCollectionMediaAsset | null {
  if (!isMediaBlockType(block.type) || !block.asset) {
    return null;
  }

  return resolveCollectionMediaAsset(
    block.asset,
    getSlashMediaPickerTabs(block.type),
    MEDIA_BLOCK_LABELS[block.type],
  );
}

// Notion-style empty "void" row: an icon + prompt, full-width and muted. It reads
// as native page content (not a boxed widget); the parent editor makes it open the
// embed dialog on click.
const PLACEHOLDER: Record<MediaBlockType, { icon: React.ReactNode; label: string }> = {
  image: { icon: <ImageIcon size={20} aria-hidden />, label: "Add an image" },
  video: { icon: <Play size={20} aria-hidden />, label: "Embed or upload a video" },
  audio: { icon: <Music size={20} aria-hidden />, label: "Add audio" },
  file: { icon: <FileText size={20} aria-hidden />, label: "Add a file" },
};

function Placeholder({ kind }: Readonly<{ kind: MediaBlockType }>) {
  const { icon, label } = PLACEHOLDER[kind];
  return (
    <div className="flex w-full items-center gap-3 rounded-[var(--osio-radius-panel)] bg-[var(--osio-bg-subtle)] px-3 py-3 text-sm text-[var(--osio-fg-muted)] transition-colors group-hover/media:bg-[var(--osio-bg-hover)]">
      <span className="shrink-0 text-[var(--osio-fg-subtle)]">{icon}</span>
      <span className="truncate">{label}</span>
    </div>
  );
}

function mediaWidthStyle(block: Block): React.CSSProperties {
  const width = typeof block.mediaWidth === "number"
    ? Math.min(100, Math.max(25, block.mediaWidth))
    : 100;
  return { width: `${width}%`, maxWidth: "100%" };
}

export const MediaBlockPreview: React.FC<MediaBlockPreviewProps> = ({
  block,
}) => {
  if (!isMediaBlockType(block.type)) {
    return null;
  }

  const resolved = resolveMediaBlockAsset(block);
  const label = resolved?.label ?? MEDIA_BLOCK_LABELS[block.type];

  if (!resolved?.url) {
    return <Placeholder kind={block.type} />;
  }

  if (block.type === "image") {
    const circle = block.mediaShape === "circle";
    return (
      <div style={mediaWidthStyle(block)}>
        <img
          src={resolved.url}
          alt={block.mediaAlt ?? label}
          className={
            circle
              ? "mx-auto block aspect-square w-full rounded-full border border-[var(--osio-border-soft)] object-cover shadow-[var(--osio-shadow-cell)]"
              : "block max-h-[24rem] w-full rounded-lg border border-[var(--osio-border-default)] object-cover"
          }
        />
      </div>
    );
  }

  if (block.type === "video") {
    return (
      <div style={mediaWidthStyle(block)}>
        <video
          controls
          preload="metadata"
          poster={resolved.thumbnailUrl}
          className="block max-h-[24rem] w-full rounded-lg border border-[var(--osio-border-default)] bg-black/90"
        >
          <source src={resolved.url} />
          <track kind="captions" />
        </video>
      </div>
    );
  }

  if (block.type === "audio") {
    return (
      <div className="rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-4">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--osio-bg-surface)] text-[var(--osio-fg-muted)]">
            <AssetRenderer value={block.asset ?? ""} size={22} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--osio-fg-default)]">
              {label}
            </p>
            <p className="text-xs text-[var(--osio-fg-muted)]">
              Audio asset
            </p>
          </div>
        </div>
        <audio controls preload="metadata" className="w-full">
          <source src={resolved.url} />
          <track kind="captions" />
        </audio>
      </div>
    );
  }

  return (
    <a
      href={resolved.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-4 transition-colors hover:bg-[var(--osio-bg-hover)]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--osio-bg-surface)] text-[var(--osio-fg-muted)]">
        <AssetRenderer value={block.asset ?? ""} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[var(--osio-fg-default)]">
          {label}
        </span>
        <span className="block text-xs text-[var(--osio-fg-muted)]">
          Open file
        </span>
      </span>
      <span className="text-xs font-medium text-[var(--osio-accent)]">
        Open
      </span>
    </a>
  );
};
