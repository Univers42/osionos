import {
  DEFAULT_COLOR_PRESETS,
  type ColorPickerPreset,
} from '@univers42/ui-collection';

export interface InlineColorOption extends ColorPickerPreset {
  id: string;
  textColor: string;
  backgroundColor: string;
  swatch: string;
}

const LEGACY_INLINE_COLOR_ALIASES: Record<string, string> = {
  gray: '#334155',
  brown: '#F59E0B',
  orange: '#F59E0B',
  yellow: '#F59E0B',
  green: '#10B981',
  blue: '#0EA5E9',
  purple: '#4F46E5',
  pink: '#F43F5E',
  red: '#F43F5E',
  slate: '#334155',
  indigo: '#4F46E5',
  sky: '#0EA5E9',
  emerald: '#10B981',
  amber: '#F59E0B',
  rose: '#F43F5E',
  white: '#FFFFFF',
  black: '#0F172A',
};

function normalizeHexColor(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(normalized)) {
    return normalized;
  }

  const shortMatch = normalized.match(/^#([0-9A-F]{3})$/);
  if (!shortMatch) {
    const rgbMatch = normalized.match(
      /^RGBA?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:\d+|\d*\.\d+))?\s*\)$/,
    );
    if (!rgbMatch) {
      return null;
    }

    const rgb = rgbMatch.slice(1, 4).map((channel) =>
      Number.parseInt(channel, 10).toString(16).padStart(2, '0').toUpperCase(),
    );
    return `#${rgb.join('')}`;
  }

  const [r, g, b] = shortMatch[1].split('');
  return `#${r}${r}${g}${g}${b}${b}`;
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) {
    return `rgba(15, 23, 42, ${alpha})`;
  }

  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function createInlineColorOption(label: string, hex: string): InlineColorOption {
  return {
    id: hex,
    label,
    value: hex,
    textColor: hex,
    backgroundColor: hexToRgba(hex, 0.18),
    swatch: hex,
  };
}

export const INLINE_COLOR_OPTIONS: InlineColorOption[] = DEFAULT_COLOR_PRESETS
  .map((preset) => {
    const hex = normalizeHexColor(preset.value);
    return hex ? createInlineColorOption(preset.label, hex) : null;
  })
  .filter((option): option is InlineColorOption => option !== null);

const INLINE_COLOR_MAP = new Map(
  INLINE_COLOR_OPTIONS.map((option) => [option.id, option] as const),
);

export function normalizeInlineColorToken(token: string) {
  const normalizedHex = normalizeHexColor(token);
  if (normalizedHex) {
    return normalizedHex;
  }

  const alias = token.trim().toLowerCase();
  return LEGACY_INLINE_COLOR_ALIASES[alias] ?? null;
}

export function getInlineColorOption(colorId: string) {
  const normalizedColor = normalizeInlineColorToken(colorId);
  if (!normalizedColor) {
    return undefined;
  }

  return (
    INLINE_COLOR_MAP.get(normalizedColor) ??
    createInlineColorOption(normalizedColor, normalizedColor)
  );
}
