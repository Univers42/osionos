/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   blockColors.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { CSSProperties } from "react";
import type { Block } from "@/entities/block";

export const BLOCK_COLOR_OPTIONS = [
  { label: "Gray", text: "var(--osio-block-tint-gray-fg)", background: "var(--osio-block-tint-gray-bg)" },
  { label: "Brown", text: "var(--osio-block-tint-brown-fg)", background: "var(--osio-block-tint-brown-bg)" },
  { label: "Orange", text: "var(--osio-block-tint-orange-fg)", background: "var(--osio-block-tint-orange-bg)" },
  { label: "Yellow", text: "var(--osio-block-tint-yellow-fg)", background: "var(--osio-block-tint-yellow-bg)" },
  { label: "Green", text: "var(--osio-block-tint-green-fg)", background: "var(--osio-block-tint-green-bg)" },
  { label: "Blue", text: "var(--osio-block-tint-blue-fg)", background: "var(--osio-block-tint-blue-bg)" },
  { label: "Purple", text: "var(--osio-block-tint-purple-fg)", background: "var(--osio-block-tint-purple-bg)" },
  { label: "Pink", text: "var(--osio-block-tint-pink-fg)", background: "var(--osio-block-tint-pink-bg)" },
  { label: "Red", text: "var(--osio-block-tint-red-fg)", background: "var(--osio-block-tint-red-bg)" },
] as const;

const DEFAULT_DARK_TEXT = "#1f2937";
const DEFAULT_LIGHT_TEXT = "#ffffff";

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(normalized)) return null;
  const rgb = normalized.slice(0, 6);
  return {
    r: Number.parseInt(rgb.slice(0, 2), 16),
    g: Number.parseInt(rgb.slice(2, 4), 16),
    b: Number.parseInt(rgb.slice(4, 6), 16),
  };
}

function isCssVariable(value: string): boolean {
  return value.trim().startsWith("var(");
}

function toLinear(value: number): number {
  const channel = value / 255;
  return channel <= 0.03928
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
}

export function contrastRatio(foreground: string, background: string): number {
  const fg = luminance(foreground);
  const bg = luminance(background);
  if (fg === null || bg === null) return Number.POSITIVE_INFINITY;
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getAccessibleTextColor(backgroundColor?: string): string | undefined {
  if (!backgroundColor) return undefined;
  if (isCssVariable(backgroundColor)) return undefined;
  const darkContrast = contrastRatio(DEFAULT_DARK_TEXT, backgroundColor);
  const lightContrast = contrastRatio(DEFAULT_LIGHT_TEXT, backgroundColor);
  return darkContrast >= lightContrast ? DEFAULT_DARK_TEXT : DEFAULT_LIGHT_TEXT;
}

/**
 * Text colour and background ACCUMULATE: `/color red` then `/background yellow`
 * must keep BOTH. An explicitly chosen text colour is the user's call, so it is
 * never silently swapped for a contrast-safe default — doing that made the two
 * commands mutually exclusive ("it's either one or the other").
 *
 * The readability guard still does the job it is actually needed for: when a block
 * has a background but NO chosen text colour, derive one that stays legible on it
 * (otherwise default-coloured text can vanish into a dark tint).
 */
export function ensureReadableTextColor(
  backgroundColor: string | undefined,
  textColor: string | undefined,
): string | undefined {
  if (textColor) return textColor;
  if (!backgroundColor) return undefined;
  return getAccessibleTextColor(backgroundColor);
}

type ColoredBlock = Pick<Block, "textColor" | "backgroundColor"> & { type?: Block["type"] };

export function getBlockTextColor(block: ColoredBlock): string | undefined {
  if (isFadedPanel(block)) return block.textColor;
  return ensureReadableTextColor(block.backgroundColor, block.textColor);
}

export function getBlockSurfaceStyle(block: ColoredBlock): CSSProperties | undefined {
  const color = getBlockTextColor(block);
  if (!color && !block.backgroundColor) return undefined;
  const backgroundColor = isFadedPanel(block) ? fadedIntoPage(block.backgroundColor!) : block.backgroundColor;
  return {
    ...(color ? { color } : {}),
    ...(backgroundColor ? { backgroundColor } : {}),
  };
}

const TINT_ALIASES: Record<string, string> = { grey: "gray" };

/** "/background red" -> the red block tint; undefined when the name is not one of the tints. */
export function resolveBlockTint(arg: string): string | undefined {
  const query = arg.trim().toLowerCase();
  if (!query) return undefined;
  const name = TINT_ALIASES[query] ?? query;
  const label = (option: (typeof BLOCK_COLOR_OPTIONS)[number]) => option.label.toLowerCase();
  return (
    BLOCK_COLOR_OPTIONS.find((option) => label(option) === name) ??
    BLOCK_COLOR_OPTIONS.find((option) => label(option).startsWith(name))
  )?.background;
}

/** Styled in block-style.scss; inset that keeps text off the edges of its tint. */
export const TINT_PANEL_CLASS = "osio-tint-panel";

// Callouts, equations and media draw their own padded box, so only plain text
// shapes need the panel geometry.
const TINT_PANEL_TYPES: ReadonlySet<Block["type"]> = new Set([
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "heading_4",
  "heading_5",
  "heading_6",
  "bulleted_list",
  "numbered_list",
  "to_do",
  "toggle",
  "quote",
]);

export function getBlockSurfaceClass(block: Pick<Block, "type" | "backgroundColor">): string {
  return block.backgroundColor && TINT_PANEL_TYPES.has(block.type) ? TINT_PANEL_CLASS : "";
}

// A hex background (the swatch picker, blocks from before the tints) on a text
// panel would be a saturated slab; mixed into the page it reads like a tint in
// either theme, and the default text stays readable on it.
const PANEL_HEX_SHARE = "14%";

function isFadedPanel(block: ColoredBlock): boolean {
  return Boolean(block.type && block.backgroundColor?.startsWith("#") && TINT_PANEL_TYPES.has(block.type));
}

function fadedIntoPage(hex: string): string {
  return `color-mix(in oklab, ${hex} ${PANEL_HEX_SHARE}, var(--osio-bg-page))`;
}

export function getBlockTextStyle(block: ColoredBlock): CSSProperties | undefined {
  const color = getBlockTextColor(block);
  return color ? { color } : undefined;
}
