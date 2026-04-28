import type { CSSProperties } from "react";
import type { Block } from "@/entities/block";

export const BLOCK_COLOR_OPTIONS = [
  { label: "Gray", text: "#4b5563", background: "#e5e7eb" },
  { label: "Brown", text: "#7c2d12", background: "#fed7aa" },
  { label: "Orange", text: "#9a3412", background: "#ffedd5" },
  { label: "Yellow", text: "#854d0e", background: "#fef08a" },
  { label: "Green", text: "#166534", background: "#bbf7d0" },
  { label: "Blue", text: "#1d4ed8", background: "#bfdbfe" },
  { label: "Purple", text: "#6b21a8", background: "#e9d5ff" },
  { label: "Pink", text: "#9d174d", background: "#fbcfe8" },
  { label: "Red", text: "#b91c1c", background: "#fecaca" },
] as const;

const RGAA_TEXT_CONTRAST = 4.5;
const DEFAULT_DARK_TEXT = "#1f2937";
const DEFAULT_LIGHT_TEXT = "#ffffff";

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
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
