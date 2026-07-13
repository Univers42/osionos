/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MediaSettingsBar.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { ImagePlus, SlidersHorizontal } from "lucide-react";

/** CSS aspect-ratio presets; "original" clears the crop (natural shape). */
const ASPECT_OPTIONS = [
  { value: "original", label: "Original" },
  { value: "1 / 1", label: "1:1" },
  { value: "4 / 3", label: "4:3" },
  { value: "16 / 9", label: "16:9" },
  { value: "3 / 4", label: "3:4" },
] as const;

interface MediaSettingsBarProps {
  label: string;
  mediaWidth: number;
  onWidthChange: (width: number) => void;
  onChangeAsset: () => void;
  /** Image-only: current aspect-ratio ("original" or a CSS ratio) + setter. */
  mediaAspect?: string;
  onAspectChange?: (aspect: string) => void;
}

/** Width slider + presets + change-asset button for a media block. */
export const MediaSettingsBar: React.FC<MediaSettingsBarProps> = ({
  label,
  mediaWidth,
  onWidthChange,
  onChangeAsset,
  mediaAspect,
  onAspectChange,
}) => (
  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--osio-border-default)] px-3 py-2">
    {onAspectChange ? (
      <div role="group" aria-label="Image ratio" className="mr-auto flex items-center gap-1">
        {ASPECT_OPTIONS.map((option) => {
          const active = (mediaAspect ?? "original") === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-label={`Ratio ${option.label}`}
              aria-pressed={active}
              className={[
                "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-[var(--osio-accent)] bg-[var(--osio-accent)]/10 text-[var(--osio-accent)]"
                  : "border-[var(--osio-border-default)] text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]",
              ].join(" ")}
              onClick={() => onAspectChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    ) : null}

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
        onChange={(event) => onWidthChange(Number(event.target.value))}
      />
      <span className="w-9 tabular-nums">{mediaWidth}%</span>
    </div>

    {[50, 75, 100].map((width) => (
      <button
        key={width}
        type="button"
        className="rounded-md border border-[var(--osio-border-default)] px-2 py-1 text-xs font-medium text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)]"
        onClick={() => onWidthChange(width)}
      >
        {width}%
      </button>
    ))}

    <button
      type="button"
      data-testid="media-block-change-asset"
      aria-label={`Change ${label.toLowerCase()}`}
      title={`Change ${label.toLowerCase()}`}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--osio-border-default)] text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)]"
      onClick={onChangeAsset}
    >
      <ImagePlus size={15} />
    </button>
  </div>
);
