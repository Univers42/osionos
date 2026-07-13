/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ColorSwatches.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Ban, Pipette } from "lucide-react";

/** A full, harmonious spectrum applied to the picked asset — recolors line icons/SVG, tints an
 *  emoji background. One vibrant step per hue around the wheel + two neutrals; "Custom" covers
 *  the rest via the native colour picker, so this is a rich starting set, not a hard limit. */
export const PICKER_COLORS: ReadonlyArray<{ name: string; value: string }> = [
  { name: "Rose", value: "#f43f5e" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Yellow", value: "#eab308" },
  { name: "Lime", value: "#84cc16" },
  { name: "Green", value: "#22c55e" },
  { name: "Emerald", value: "#10b981" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Sky", value: "#0ea5e9" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Purple", value: "#a855f7" },
  { name: "Fuchsia", value: "#d946ef" },
  { name: "Pink", value: "#ec4899" },
  { name: "Slate", value: "#64748b" },
  { name: "Graphite", value: "#475569" },
];

/** Common English color words that aren't literal swatch names, mapped to the
 *  closest swatch — so "/color gray" resolves instead of falling back to the picker. */
const COLOR_ALIASES: Record<string, string> = {
  gray: "graphite",
  grey: "graphite",
  magenta: "fuchsia",
  turquoise: "teal",
};

/** Resolve a typed color argument ("gray", "blue", "gr") to a swatch hex, or
 *  undefined when it matches nothing — in which case the caller opens the picker.
 *  Exact name wins, then a unique prefix. */
export function resolveColorName(arg: string): string | undefined {
  const query = arg.trim().toLowerCase();
  if (!query) return undefined;
  const resolved = COLOR_ALIASES[query] ?? query;
  return (
    PICKER_COLORS.find((color) => color.name.toLowerCase() === resolved) ??
    PICKER_COLORS.find((color) => color.name.toLowerCase().startsWith(resolved))
  )?.value;
}

const RAINBOW = "conic-gradient(from 210deg, #f43f5e, #f97316, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #f43f5e)";
const DOT = "h-6 w-6 rounded-full ring-1 ring-inset ring-[var(--osio-border-default)] transition-[box-shadow] duration-[120ms]";
const SELECTED = "ring-2 ring-[var(--osio-accent)] ring-offset-2 ring-offset-[var(--osio-bg-surface)]";

export const ColorSwatches: React.FC<{ value?: string; onChange: (color?: string) => void }> = ({ value, onChange }) => {
  const isCustom = value !== undefined && !PICKER_COLORS.some((color) => color.value === value);

  return (
    <div className="border-b border-[var(--osio-border-default)] px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--osio-fg-subtle)]">Color</span>
        {value ? (
          <button type="button" onClick={() => onChange(undefined)} className="text-[11px] text-[var(--osio-fg-muted)] hover:text-[var(--osio-fg-default)]">Reset</button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* No title attrs on swatches: the e2e pick-helper selects the first `button[title]`
            as "the asset" — titled swatches made every pick-scenario grab a color instead. */}
        <button
          type="button"
          aria-label="Default color"
          aria-pressed={value === undefined}
          onClick={() => onChange(undefined)}
          className={`flex items-center justify-center bg-[var(--osio-bg-subtle)] ${DOT} ${value === undefined ? SELECTED : ""}`}
        >
          <Ban size={12} className="text-[var(--osio-fg-muted)]" />
        </button>

        {PICKER_COLORS.map((color) => (
          <button
            key={color.name}
            type="button"
            aria-label={color.name}
            aria-pressed={value === color.value}
            onClick={() => onChange(color.value)}
            className={`${DOT} ${value === color.value ? SELECTED : ""}`}
            style={{ background: color.value }}
          />
        ))}

        <label
          aria-label="Custom color"
          className={`relative flex cursor-pointer items-center justify-center overflow-hidden ${DOT} ${isCustom ? SELECTED : ""}`}
          style={{ background: isCustom ? value : RAINBOW }}
        >
          {isCustom ? null : <Pipette size={11} className="text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]" />}
          <input type="color" value={isCustom ? value : "#3b82f6"} onChange={(e) => onChange(e.target.value)} className="sr-only" />
        </label>
      </div>
    </div>
  );
};
