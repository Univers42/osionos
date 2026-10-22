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

import React, { useEffect, useRef, useState } from "react";
import { IconValueView } from "@osionos/ui/atoms/IconValueView";
import { FileText, ImageIcon, Music, Play } from "lucide-react";

import {
  MEDIA_BLOCK_LABELS,
  isMediaBlockType,
  type Block,
  type MediaBlockType,
} from "@/entities/block";
import { animatedMediaMayPlay, usePrefersReducedMotion } from "@/entities/page/ui/coverMedia";
import {
  type ResolvedCollectionMediaAsset,
  resolveCollectionMediaAsset,
} from "@/shared/ui/assets/collectionMedia";
import { useAnimatedImagesMode } from "@/shared/config/useAppearance";

interface MediaBlockPreviewProps {
  block: Block;
}

export function resolveMediaBlockAsset(
  block: Block,
): ResolvedCollectionMediaAsset | null {
  if (!isMediaBlockType(block.type) || !block.asset) {
    return null;
  }

  return resolveCollectionMediaAsset(block.asset, MEDIA_BLOCK_LABELS[block.type]);
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

/**
 * Whether the source is an animated image the app can freeze.
 *
 * Caveat: only GIFs are detected — an animated WebP or APNG keeps animating
 * whatever the person chose — and chat attachments and avatars are not covered
 * at all: they have their own renderers, not this one.
 */
function isAnimatedImageSource(url: string): boolean {
  const source = url.toLowerCase();
  if (source.startsWith("data:image/gif")) return true;
  return /\.gif(?:$|[?#])/.test(source);
}

interface ImageFrameProps {
  src: string;
  alt: string;
  /** The first frame is painted instead of the animation. */
  still: boolean;
  className: string;
  style?: React.CSSProperties;
}

/**
 * An image block's picture. A frozen animated image is painted on a canvas —
 * drawImage of the decoded image paints its default frame — and a button
 * swaps the live image back in, so the animation is the person's to start.
 */
const ImageFrame: React.FC<ImageFrameProps> = ({ src, alt, still, className, style }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!still || playing) return undefined;
    const image = new Image();
    image.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = image.naturalWidth || 1;
      canvas.height = image.naturalHeight || 1;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
    };
    image.src = src;
    return () => {
      image.onload = null;
    };
  }, [src, still, playing]);

  if (!still || playing) {
    return (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        style={style}
        className={className}
        data-testid="media-block-image"
      />
    );
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={alt}
        style={style}
        className={className}
        data-testid="media-block-image-canvas"
      />
      {/* The editor wraps an image block in a button (it opens the media
          settings), so this one stops the click from bubbling to it. */}
      <button
        type="button"
        data-testid="media-block-image-play"
        aria-label="Play animation"
        onClick={(event) => {
          event.stopPropagation();
          setPlaying(true);
        }}
        className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-[var(--osio-radius-control)] bg-[var(--osio-bg-surface)] px-2 py-1 text-xs font-medium text-[var(--osio-fg-default)] shadow-[var(--osio-shadow-sm)]"
      >
        <Play size={14} aria-hidden />
        Play
      </button>
    </div>
  );
};

export const MediaBlockPreview: React.FC<MediaBlockPreviewProps> = ({
  block,
}) => {
  const animatedImages = useAnimatedImagesMode();
  const reducedMotion = usePrefersReducedMotion();

  if (!isMediaBlockType(block.type)) {
    return null;
  }

  const resolved = resolveMediaBlockAsset(block);
  const label = resolved?.label ?? MEDIA_BLOCK_LABELS[block.type];

  if (!resolved?.url) {
    return <Placeholder kind={block.type} />;
  }

  if (block.type === "image") {
    const alt = block.mediaAlt ?? label;
    const still = isAnimatedImageSource(resolved.url)
      && !animatedMediaMayPlay(animatedImages, reducedMotion);
    if (block.mediaShape === "circle") {
      return (
        <div style={mediaWidthStyle(block)}>
          <ImageFrame
            src={resolved.url}
            alt={alt}
            still={still}
            className="mx-auto block aspect-square w-full rounded-full border border-[var(--osio-border-soft)] object-cover shadow-[var(--osio-shadow-cell)]"
          />
        </div>
      );
    }
    // An explicit ratio crops to a fixed box; "original"/unset keeps the natural
    // shape but caps height so a tall image never dominates the page.
    const aspect =
      block.mediaAspect && block.mediaAspect !== "original" ? block.mediaAspect : undefined;
    return (
      <div style={mediaWidthStyle(block)}>
        <ImageFrame
          src={resolved.url}
          alt={alt}
          still={still}
          style={aspect ? { aspectRatio: aspect } : undefined}
          className={
            aspect
              ? "block h-full w-full rounded-lg border border-[var(--osio-border-default)] object-cover"
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
            <IconValueView value={block.asset ?? ""} size={22} />
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
        <IconValueView value={block.asset ?? ""} size={22} />
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
