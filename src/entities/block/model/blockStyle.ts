/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   blockStyle.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from './types';

export const STYLE_SCALES = {
  tone: ['default', 'primary', 'subtle', 'ghost', 'danger', 'danger-subtle', 'success', 'warning', 'accent'],
  size: ['sm', 'md', 'lg'],
  text: ['default', 'muted', 'subtle', 'accent', 'danger', 'success', 'warning', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'],
  surface: ['default', 'muted', 'subtle', 'accent', 'danger', 'success', 'warning', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'],
  border: ['none', 'subtle', 'default', 'strong', 'danger', 'accent'],
  borderSides: ['all', 'top', 'bottom', 'x', 'y'],
  radius: ['none', 'sm', 'md', 'panel', 'lg', 'full'],
  space: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  width: ['hug', 'fill', 'fixed'],
  align: ['start', 'center', 'end', 'stretch'],
  justify: ['start', 'center', 'end', 'between'],
  textSize: ['xs', 'sm', 'base', 'lg', 'xl'],
  weight: ['regular', 'medium', 'semibold'],
  shadow: ['none', 'menu', 'panel'],
} as const;

export type Space = (typeof STYLE_SCALES.space)[number];

export interface BlockStyle {
  tone?: (typeof STYLE_SCALES.tone)[number];
  size?: (typeof STYLE_SCALES.size)[number];
  text?: (typeof STYLE_SCALES.text)[number];
  surface?: (typeof STYLE_SCALES.surface)[number];
  border?: (typeof STYLE_SCALES.border)[number];
  borderSides?: (typeof STYLE_SCALES.borderSides)[number];
  radius?: (typeof STYLE_SCALES.radius)[number];
  padding?: Space;
  paddingX?: Space;
  paddingY?: Space;
  gap?: Space;
  width?: (typeof STYLE_SCALES.width)[number];
  fixedWidth?: Space;
  basis?: Space;
  align?: (typeof STYLE_SCALES.align)[number];
  justify?: (typeof STYLE_SCALES.justify)[number];
  textSize?: (typeof STYLE_SCALES.textSize)[number];
  weight?: (typeof STYLE_SCALES.weight)[number];
  shadow?: (typeof STYLE_SCALES.shadow)[number];
}

const PROP_SCALE: Record<string, keyof typeof STYLE_SCALES> = {
  tone: 'tone',
  size: 'size',
  text: 'text',
  surface: 'surface',
  border: 'border',
  borderSides: 'borderSides',
  radius: 'radius',
  padding: 'space',
  paddingX: 'space',
  paddingY: 'space',
  gap: 'space',
  width: 'width',
  fixedWidth: 'space',
  basis: 'space',
  align: 'align',
  justify: 'justify',
  textSize: 'textSize',
  weight: 'weight',
  shadow: 'shadow',
};

export function sanitizeBlockStyle(input: unknown): BlockStyle {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: BlockStyle = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const scaleKey = PROP_SCALE[key];
    if (!scaleKey) continue;
    const allowed = STYLE_SCALES[scaleKey] as readonly unknown[];
    if (!allowed.includes(value)) continue;
    (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

const STYLE_PROPS: readonly (keyof BlockStyle)[] = [
  'tone', 'size', 'text', 'surface', 'border', 'borderSides', 'radius',
  'padding', 'paddingX', 'paddingY', 'gap', 'width', 'fixedWidth', 'basis',
  'align', 'justify', 'textSize', 'weight', 'shadow',
];

function computeStyle(block: Pick<Block, 'style' | 'textColor' | 'backgroundColor'>): Readonly<Record<string, string>> {
  const sanitized = sanitizeBlockStyle(block.style);
  const out: Record<string, string> = {};
  for (const prop of STYLE_PROPS) {
    const value = sanitized[prop];
    if (value !== undefined) out[`data-s-${prop}`] = String(value);
  }
  // Flat fields are fallbacks: style wins when present.
  if (out['data-s-text'] === undefined && block.textColor !== undefined && block.textColor !== null) {
    out['data-s-text'] = String(block.textColor);
  }
  if (out['data-s-surface'] === undefined && block.backgroundColor !== undefined && block.backgroundColor !== null) {
    out['data-s-surface'] = String(block.backgroundColor);
  }
  return Object.freeze(out);
}

const cache = new WeakMap<object, Readonly<Record<string, string>>>();

export function resolveBlockStyle(block: Pick<Block, 'style' | 'textColor' | 'backgroundColor'>): Readonly<Record<string, string>> {
  const style = block.style;
  if (style && typeof style === 'object') {
    const hit = cache.get(style);
    if (hit) return hit;
    const result = computeStyle(block);
    cache.set(style, result);
    return result;
  }
  return computeStyle(block);
}