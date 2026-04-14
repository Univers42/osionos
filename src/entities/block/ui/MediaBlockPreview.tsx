/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MediaBlockPreview.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/14 00:00:00 by rstancu           #+#    #+#             */
/*   Updated: 2026/04/14 20:34:48 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import {
  AssetRenderer,
  resolveAssetValue,
  resolveMediaUrl,
} from "@univers42/ui-collection";

import {
  MEDIA_BLOCK_LABELS,
  isMediaBlockType,
  type Block,
} from "@/entities/block";
import { getSlashMediaPickerTabs } from "@/shared/lib/markengine/uiCollectionAssets";

interface MediaBlockPreviewProps {
  block: Block;
}

interface ResolvedMediaBlockAsset {
  label: string;
  url?: string;
  thumbnailUrl?: string;
}

export function resolveMediaBlockAsset(
  block: Block,
): ResolvedMediaBlockAsset | null {
  if (!isMediaBlockType(block.type) || !block.asset) {
    return null;
  }

  const resolved = resolveAssetValue(block.asset, getSlashMediaPickerTabs(block.type));
  if (!resolved) {
    return null;
  }

  const mediaItem = resolved.mediaItem;

  return {
    label:
      resolved.item?.label ??
      mediaItem?.label ??
      MEDIA_BLOCK_LABELS[block.type],
    url: mediaItem ? resolveMediaUrl(mediaItem.ref) : undefined,
    thumbnailUrl: mediaItem?.thumbnailRef
      ? resolveMediaUrl(mediaItem.thumbnailRef)
      : undefined,
  };
}

function Placeholder({ label }: Readonly<{ label: string }>) {
  return (
    <div className="flex min-h-[144px] items-center justify-center rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-surface-secondary)] px-4 text-sm text-[var(--color-ink-faint)]">
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
        className="block max-h-[24rem] w-full rounded-lg border border-[var(--color-line)] object-cover"
      />
    );
  }

  if (block.type === "video") {
    return (
      <video
        controls
        preload="metadata"
        poster={resolved.thumbnailUrl}
        className="block max-h-[24rem] w-full rounded-lg border border-[var(--color-line)] bg-black/90"
      >
        <source src={resolved.url} />
      </video>
    );
  }

  if (block.type === "audio") {
    return (
      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-secondary)] p-4">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-primary)] text-[var(--color-ink-muted)]">
            <AssetRenderer value={block.asset ?? ""} size={22} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--color-ink)]">
              {label}
            </p>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Audio asset
            </p>
          </div>
        </div>
        <audio controls preload="metadata" className="w-full">
          <source src={resolved.url} />
        </audio>
      </div>
    );
  }

  return (
    <a
      href={resolved.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-secondary)] p-4 transition-colors hover:bg-[var(--color-surface-hover)]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-primary)] text-[var(--color-ink-muted)]">
        <AssetRenderer value={block.asset ?? ""} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[var(--color-ink)]">
          {label}
        </span>
        <span className="block text-xs text-[var(--color-ink-muted)]">
          Open file
        </span>
      </span>
      <span className="text-xs font-medium text-[var(--color-accent)]">
        Open
      </span>
    </a>
  );
};
