/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MediaBlockPreview.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/14 00:00:00 by rstancu           #+#    #+#             */
/*   Updated: 2026/05/05 15:08:41 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { AssetRenderer } from "@univers42/ui-collection";

import {
  MEDIA_BLOCK_LABELS,
  isMediaBlockType,
  type Block,
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

function Placeholder({ label }: Readonly<{ label: string }>) {
  return (
    <div className="flex min-h-[144px] items-center justify-center rounded-lg border border-dashed border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-4 text-sm text-[var(--osio-fg-subtle)]">
      {label}
    </div>
  );
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
    return <Placeholder label={`Select a ${label.toLowerCase()}`} />;
  }

  if (block.type === "image") {
    return (
      <img
        src={resolved.url}
        alt={label}
        className="block max-h-[24rem] w-full rounded-lg border border-[var(--osio-border-default)] object-cover"
      />
    );
  }

  if (block.type === "video") {
    return (
      <video
        controls
        preload="metadata"
        poster={resolved.thumbnailUrl}
        className="block max-h-[24rem] w-full rounded-lg border border-[var(--osio-border-default)] bg-black/90"
      >
        <source src={resolved.url} />
        <track kind="captions" />
      </video>
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
