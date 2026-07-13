/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   coverPickerTiles.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Play } from "lucide-react";

import {
  normalizeMediaSource,
  type CoverPickerAsset,
} from "@/shared/lib/markengine/uiCollectionAssets";

export function isGradientValue(value: string): boolean {
  return value.startsWith("linear-gradient") || value.startsWith("radial-gradient");
}

/** Accept http(s)/data/blob URLs, or upgrade a bare domain to https. */
export function normalizeExternalUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

interface CoverTileProps {
  item: CoverPickerAsset;
  selected?: boolean;
  /** Show a ▶ badge (ambient-video presets). */
  video?: boolean;
  onSelect: (value: string) => void;
}

/**
 * One preset tile. Thumbnails are lazy + async-decoded so a 250-tile gallery
 * only fetches what scrolls into view. Video presets play their clip (muted,
 * looped) while hovered/focused — network cost only on intent.
 */
export const CoverTile: React.FC<CoverTileProps> = ({ item, selected, video, onSelect }) => {
  const preview = item.previewUrl ?? item.ref;
  const [motion, setMotion] = React.useState(false);
  return (
    <button
      type="button"
      data-testid="cover-picker-item"
      className={[
        "group overflow-hidden rounded-md border text-left transition",
        selected
          ? "border-[var(--osio-accent)] ring-2 ring-[var(--osio-accent)]/20"
          : "border-[var(--osio-border-default)] hover:border-[var(--osio-accent)]",
      ].join(" ")}
      onClick={() => onSelect(item.ref)}
      onPointerEnter={video ? () => setMotion(true) : undefined}
      onPointerLeave={video ? () => setMotion(false) : undefined}
      onFocus={video ? () => setMotion(true) : undefined}
      onBlur={video ? () => setMotion(false) : undefined}
    >
      <span className="relative block h-20 bg-[var(--osio-bg-subtle)]">
        {isGradientValue(preview) ? (
          <span className="block h-full w-full" style={{ background: preview }} />
        ) : (
          <img
            src={normalizeMediaSource(preview)}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            draggable={false}
          />
        )}
        {video && motion ? (
          <video
            src={normalizeMediaSource(item.ref)}
            className="absolute inset-0 h-full w-full object-cover"
            muted
            loop
            playsInline
            autoPlay
            preload="auto"
            ref={(el) => { if (el) { el.defaultMuted = true; el.muted = true; void el.play().catch(() => {}); } }}
          />
        ) : null}
        {video ? (
          <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white">
            <Play size={10} fill="currentColor" />
          </span>
        ) : null}
      </span>
      <span className="flex min-h-8 items-center justify-between gap-2 px-2 py-1.5">
        <span className="truncate text-xs font-medium text-[var(--osio-fg-default)]">{item.label}</span>
        {item.credit ? (
          <span className="shrink-0 truncate text-[10px] text-[var(--osio-fg-subtle)]">{item.credit}</span>
        ) : null}
      </span>
    </button>
  );
};
