/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MediaBlockPreview.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/14 00:00:00 by rstancu           #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { ImageTagChips } from "./ImageTagChips";
import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { IconValueView } from "@osionos/ui/atoms/IconValueView";
import { FileText, ImageIcon, Music, Pause, Play } from "lucide-react";

import {
  MEDIA_BLOCK_LABELS,
  isAiGenerated,
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

import { mayBeProviderLink } from "../model/mediaProviderLinks";

// Lazy: the provider table and embed views load only for a link that may need them.
const ProviderMediaEmbed = lazy(() =>
  import("./ProviderMediaEmbed").then((m) => ({ default: m.ProviderMediaEmbed })),
);

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

/** The block's width preset (25–100 %), on whatever element frames the media. */
export function mediaWidthStyle(block: Block): React.CSSProperties {
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

/** How an image block's animation stands. */
export interface ImageAnimation {
  /** The animation is suppressed: the picture is held on its first frame. */
  frozen: boolean;
  /** The picture IS the first frame — the animation is not running. */
  still: boolean;
  /** Run the animation, or hold it on its first frame again. */
  setRunning: (running: boolean) => void;
}

/**
 * The animation state of an image block. The editor lifts it out of the
 * picture so its play control can sit BESIDE the edit button — a button
 * inside a button is invalid HTML and unreachable for a keyboard — while the
 * read-only renderer lets the picture own it.
 */
export function useImageAnimation(block: Block): ImageAnimation {
  const animatedImages = useAnimatedImagesMode();
  const reducedMotion = usePrefersReducedMotion();
  const [running, setRunning] = useState(false);
  const url = resolveMediaBlockAsset(block)?.url ?? "";
  const frozen = isAnimatedImageSource(url) && !animatedMediaMayPlay(animatedImages, reducedMotion);
  return { frozen, still: frozen && !running, setRunning };
}

/**
 * An image block's picture, with its shape and its size. A frozen animated
 * image is painted on a canvas — drawImage of the decoded image paints its
 * default frame — so the animation only runs when the person asks for it.
 */
export const ImageBlockPicture: React.FC<{ block: Block; animation: ImageAnimation }> = ({ block, animation }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const resolved = resolveMediaBlockAsset(block);
  const url = resolved?.url;
  const alt = block.mediaAlt ?? resolved?.label ?? MEDIA_BLOCK_LABELS.image;
  // An explicit ratio crops to a fixed box; "original"/unset keeps the natural
  // shape but caps height so a tall image never dominates the page.
  const aspect = block.mediaAspect && block.mediaAspect !== "original" ? block.mediaAspect : undefined;

  useEffect(() => {
    if (!url || !animation.still) return undefined;
    const image = new Image();
    image.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = image.naturalWidth || 1;
      canvas.height = image.naturalHeight || 1;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
    };
    image.src = url;
    return () => {
      image.onload = null;
    };
  }, [url, animation.still]);

  if (!url) return <Placeholder kind="image" />;

  const className = block.mediaShape === "circle"
    ? "mx-auto block aspect-square w-full rounded-full border border-[var(--osio-border-soft)] object-cover shadow-[var(--osio-shadow-cell)]"
    : aspect
      ? "block h-full w-full rounded-lg border border-[var(--osio-border-default)] object-cover"
      : "block max-h-[24rem] w-full rounded-lg border border-[var(--osio-border-default)] object-cover";
  const style = aspect ? { aspectRatio: aspect } : undefined;

  if (!animation.still) {
    return (
      <img
        src={url}
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
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={alt}
      style={style}
      className={className}
      data-testid="media-block-image-canvas"
    />
  );
};

/**
 * The control that runs an image block's animation, or holds it on its first
 * frame. It is a SIBLING of the edit button in the editor: a button inside a
 * button is invalid HTML, and a keyboard cannot reach the inner one.
 */
export const ImagePlayButton: React.FC<{ running: boolean; onToggle: () => void; className?: string }> = ({
  running,
  onToggle,
  className = '',
}) => (
  <button
    type="button"
    data-testid="media-block-image-play"
    aria-label={running ? "Pause animation" : "Play animation"}
    aria-pressed={running}
    onClick={onToggle}
    className={`inline-flex items-center gap-1 rounded-[var(--osio-radius-control)] bg-[var(--osio-bg-surface)] px-2 py-1 text-xs font-medium text-[var(--osio-fg-default)] shadow-[var(--osio-shadow-sm)] ${className}`}
  >
    {running ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
    {running ? "Pause" : "Play"}
  </button>
);

const DirectMediaPreview: React.FC<MediaBlockPreviewProps> = ({
  block,
}) => {
  const animation = useImageAnimation(block);

  if (!isMediaBlockType(block.type)) {
    return null;
  }

  const resolved = resolveMediaBlockAsset(block);
  const label = resolved?.label ?? MEDIA_BLOCK_LABELS[block.type];

  if (!resolved?.url) {
    return <Placeholder kind={block.type} />;
  }

  if (block.type === "image") {
    // An image the AI made says so — here, on a published page, and in the
    // editor: the provenance rides the block, never the prompt.
    const provenance = isAiGenerated(block) ? block.aiGenerated : null;
    const caption = provenance ? (
      <figcaption
        className="mt-1 text-2xs text-[var(--osio-fg-muted)]"
        title={`Generated by ${provenance.model}`}
      >
        AI-generated
      </figcaption>
    ) : null;
    return (
      <figure style={mediaWidthStyle(block)}>
        <div className="relative">
          <ImageBlockPicture block={block} animation={animation} />
          {animation.frozen ? (
            <ImagePlayButton
              running={!animation.still}
              onToggle={() => animation.setRunning(animation.still)}
              className="absolute bottom-2 right-2"
            />
          ) : null}
        </div>
        {caption}
        <ImageTagChips tags={block.mediaTags ?? []} text={block.mediaText} />
      </figure>
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

/** The block's media. A video/audio/file link that is a provider page (YouTube, Spotify,
 *  Drive, a PDF) becomes an embed; the direct-file preview shows until that is known. */
export const MediaBlockPreview: React.FC<MediaBlockPreviewProps> = ({ block }) => {
  const direct = <DirectMediaPreview block={block} />;
  const url = resolveMediaBlockAsset(block)?.url;
  if (url === undefined || !mayBeProviderLink(block.type, url)) return direct;
  return (
    <Suspense fallback={direct}>
      <ProviderMediaEmbed block={block} url={url} fallback={direct} />
    </Suspense>
  );
};
