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

const RGAA_TEXT_CONTRAST = 4.5;
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

export function ensureReadableTextColor(
  backgroundColor: string | undefined,
  textColor: string | undefined,
): string | undefined {
  if (!backgroundColor) return textColor;
  if (textColor && contrastRatio(textColor, backgroundColor) >= RGAA_TEXT_CONTRAST) {
    return textColor;
  }
  return getAccessibleTextColor(backgroundColor);
}

export function getBlockTextColor(block: Pick<Block, "textColor" | "backgroundColor">): string | undefined {
  return ensureReadableTextColor(block.backgroundColor, block.textColor);
}

export function getBlockSurfaceStyle(block: Pick<Block, "textColor" | "backgroundColor">): CSSProperties | undefined {
  const color = getBlockTextColor(block);
  if (!color && !block.backgroundColor) return undefined;
  return {
    ...(color ? { color } : {}),
    ...(block.backgroundColor ? { backgroundColor: block.backgroundColor } : {}),
  };
}

export function getBlockTextStyle(block: Pick<Block, "textColor" | "backgroundColor">): CSSProperties | undefined {
  const color = getBlockTextColor(block);
  return color ? { color } : undefined;
}
