/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   calloutTypes.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Semantic callout types. A callout's `block.color` may hold an EMOJI (icon picker) OR a
 * word KIND (markdown `> [!warning]`), so the renderer can't key tints off the emoji alone.
 * `resolveCalloutType` maps either form (or none) to one preset, unifying both inputs and
 * fixing kind-based callouts that used to render flat. Tints reuse the `--osio-block-tint-*`
 * tokens and color only the SURFACE + border + icon — body text stays default for contrast.
 */

import type { CSSProperties } from "react";

export type CalloutTone = "gray" | "blue" | "green" | "yellow" | "orange" | "red" | "purple";

export interface CalloutType {
  id: string;
  label: string;
  icon: string; // emoji shown when the callout carries no custom emoji
  tone: CalloutTone;
}

/** The semantic presets offered in the type picker (each maps to a distinct accessible tint). */
export const CALLOUT_TYPES: readonly CalloutType[] = [
  { id: "note", label: "Note", icon: "📝", tone: "gray" },
  { id: "info", label: "Info", icon: "ℹ️", tone: "blue" },
  { id: "tip", label: "Tip", icon: "💡", tone: "yellow" },
  { id: "success", label: "Success", icon: "✅", tone: "green" },
  { id: "warning", label: "Warning", icon: "⚠️", tone: "orange" },
  { id: "danger", label: "Danger", icon: "🛑", tone: "red" },
  { id: "important", label: "Important", icon: "❗", tone: "purple" },
];

const NOTE = CALLOUT_TYPES[0];

/** word-kinds + legacy emojis (from the old CALLOUT_COLORS) → preset id. */
const ALIASES: Record<string, string> = {
  warn: "warning", caution: "warning", attention: "warning", "🔥": "warning",
  error: "danger", err: "danger", bug: "danger", failure: "danger", "❌": "danger",
  idea: "tip", hint: "tip", "⭐": "tip",
  check: "success", done: "success", ok: "success",
  question: "info", "📌": "info", "🎯": "info",
  example: "important", quote: "important", "💬": "note",
};

const BY_KEY: Record<string, CalloutType> = (() => {
  const map: Record<string, CalloutType> = {};
  for (const type of CALLOUT_TYPES) { map[type.id] = type; map[type.icon] = type; }
  for (const [key, id] of Object.entries(ALIASES)) {
    const type = CALLOUT_TYPES.find((t) => t.id === id);
    if (type) map[key] = type;
  }
  return map;
})();

/** Resolve a callout's `color` (emoji, word-kind, or empty) to a semantic preset; unknown → Note. */
export function resolveCalloutType(color?: string | null): CalloutType {
  if (!color) return NOTE;
  const raw = color.trim();
  return BY_KEY[raw] ?? BY_KEY[raw.toLowerCase()] ?? NOTE;
}

/** The emoji to display: a word-kind shows its preset's icon; an emoji (custom or known) shows as-is. */
export function calloutDisplayIcon(color?: string | null): string {
  const raw = (color ?? "").trim();
  if (!raw) return NOTE.icon;
  return /^[a-z]+$/i.test(raw) ? resolveCalloutType(raw).icon : raw;
}

/** Tint for the callout surface + 3px left accent rail (admonition pattern; NOT the body text). */
export function calloutSurface(type: CalloutType): CSSProperties {
  return {
    backgroundColor: `var(--osio-block-tint-${type.tone}-bg)`,
    borderLeftColor: `var(--osio-block-tint-${type.tone}-fg)`,
  };
}

/** Accent color (icon, left rail, type chip) for a callout type. */
export function calloutAccent(type: CalloutType): string {
  return `var(--osio-block-tint-${type.tone}-fg)`;
}
