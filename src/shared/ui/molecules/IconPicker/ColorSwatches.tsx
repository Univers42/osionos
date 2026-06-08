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
import { X } from "lucide-react";

/** Palette applied to the picked asset — recolors line icons/SVG, tints an emoji background. */
export const PICKER_COLORS: ReadonlyArray<{ name: string; value?: string }> = [
  { name: "Default" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Green", value: "#22c55e" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
  { name: "Slate", value: "#64748b" },
];

export const ColorSwatches: React.FC<{ value?: string; onChange: (color?: string) => void }> = ({ value, onChange }) => (
  <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--osio-border-default)] px-3 py-2">
    {PICKER_COLORS.map((swatch) => {
      const selected = (swatch.value ?? "") === (value ?? "");
      return (
        <button
          key={swatch.name}
          type="button"
          title={swatch.name}
          aria-label={swatch.name}
          aria-pressed={selected}
          onClick={() => onChange(swatch.value)}
          className={`flex h-5 w-5 items-center justify-center rounded-full border transition ${
            selected ? "ring-2 ring-[var(--osio-accent)] ring-offset-1 ring-offset-[var(--osio-bg-surface)]" : ""
          }`}
          style={{ background: swatch.value ?? "var(--osio-bg-subtle)", borderColor: "var(--osio-border-default)" }}
        >
          {swatch.value ? null : <X size={11} className="text-[var(--osio-fg-muted)]" />}
        </button>
      );
    })}
  </div>
);
