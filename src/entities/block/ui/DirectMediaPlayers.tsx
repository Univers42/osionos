import React from "react";
import { FileText, Music } from "lucide-react";

import type { Block } from "@/entities/block";
import { blockWidthStyle } from "@/shared/lib/dom/blockResize";
import { mediaCrossOrigin } from "@/shared/lib/media/mediaCrossOrigin";
import type { ResolvedCollectionMediaAsset } from "@/shared/ui/assets/collectionMedia";

import { IMAGE_MIN_WIDTH } from "../model/blockSize";

/** The direct-file players of a video, audio or file block (the image has its own picture). */

export const VideoPreview: React.FC<{ block: Block; resolved: ResolvedCollectionMediaAsset }> = ({ block, resolved }) => (
  <div style={blockWidthStyle(block.mediaWidth, IMAGE_MIN_WIDTH)}>
    <video
      controls
      preload="metadata"
      crossOrigin={mediaCrossOrigin(resolved.url)}
      poster={resolved.thumbnailUrl}
      className="block max-h-[24rem] w-full rounded-lg border border-[var(--osio-border-default)] bg-black/90"
    >
      <source src={resolved.url} />
      <track kind="captions" />
    </video>
  </div>
);

export const AudioPreview: React.FC<{ resolved: ResolvedCollectionMediaAsset; label: string }> = ({ resolved, label }) => (
  <div className="rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-4">
    <div className="mb-3 flex items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--osio-bg-surface)] text-[var(--osio-fg-muted)]">
        <Music size={22} aria-hidden />
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

export const FileLinkPreview: React.FC<{ resolved: ResolvedCollectionMediaAsset; label: string }> = ({ resolved, label }) => (
  <a
    href={resolved.url}
    target="_blank"
    rel="noreferrer"
    className="flex items-center gap-3 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-4 transition-colors hover:bg-[var(--osio-bg-hover)]"
  >
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--osio-bg-surface)] text-[var(--osio-fg-muted)]">
      <FileText size={22} aria-hidden />
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
