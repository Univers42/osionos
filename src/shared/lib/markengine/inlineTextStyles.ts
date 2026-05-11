/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineTextStyles.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:25:40 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:25:41 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
  DEFAULT_COLOR_PRESETS,
  type ColorPickerPreset,
} from '@univers42/ui-collection';
import { normalizeHexColor, normalizeInlineColorToken } from './inlineColorTokens';
export { normalizeInlineColorToken } from './inlineColorTokens';

export interface InlineColorOption extends ColorPickerPreset {
  id: string;
  textColor: string;
  backgroundColor: string;
  swatch: string;
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
