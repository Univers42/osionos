/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   blockStyleAttributes.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// `{k=v}` on a `:::` opener <-> a block's style (ADR 0064 PS11, PS13). The engine hands
// over raw strings and knows no scale; this is the one place they become style, and only
// through sanitizeBlockStyle. The writer puts only layout keys on an opener: the rest of a
// style rides the page file's overlay, as it always did.
import { PROP_SCALE, STYLE_SCALES, sanitizeBlockStyle, type BlockStyle } from './blockStyle';

/** The container keys of a style (PS6): the ones a `:::` opener carries. */
export const LAYOUT_STYLE_KEYS = ['layout', 'wrap', 'cols', 'minCol', 'stackAt', 'span'] as const;

/** One attribute that did not become style. Engine reports (`length`, `pairs`,
 *  `malformed`, `duplicate`) have no key; `unknown` / `value` / `kind` name theirs. */
export interface StyleAttributeDrop {
  key?: string;
  reason: string;
}

// `::: grid` means `layout=grid`; `section`, `columns` and `column` imply nothing.
const KIND_LAYOUT: Readonly<Record<string, BlockStyle['layout']>> = { row: 'row', stack: 'stack', grid: 'grid' };

// Numeric scales hold small integers only: `03` reads as 3, `1e3` / `1.0` / `-1` stay strings
// and fail the scale.
const SCALE_NUMBER_RE = /^\d{1,3}$/;

function coerced(key: string, value: string): unknown {
  const scale = STYLE_SCALES[PROP_SCALE[key]] as readonly unknown[];
  return typeof scale[0] === 'number' && SCALE_NUMBER_RE.test(value) ? Number(value) : value;
}

/** The style an opener's kind and attributes describe. What is not on a scale is
 *  dropped and reported, never thrown. O(pairs). */
export function styleFromAttributes(
  kind: string,
  values: Readonly<Record<string, string>>,
): { style: BlockStyle; dropped: StyleAttributeDrop[] } {
  const record: Record<string, unknown> = {};
  const dropped: StyleAttributeDrop[] = [];
  for (const key of Object.keys(values)) {
    if (Object.hasOwn(PROP_SCALE, key)) record[key] = coerced(key, values[key]);
    else dropped.push({ key, reason: 'unknown' });
  }
  const implied = Object.hasOwn(KIND_LAYOUT, kind) ? KIND_LAYOUT[kind] : undefined;
  if (implied !== undefined) {
    if (Object.hasOwn(record, 'layout') && record.layout !== implied) dropped.push({ key: 'layout', reason: 'kind' });
    record.layout = implied;
  }
  const style = sanitizeBlockStyle(record);
  for (const key of Object.keys(record)) {
    if (!Object.hasOwn(style, key)) dropped.push({ key, reason: 'value' });
  }
  return { style, dropped };
}

/** ` {layout=grid cols=3}`: a stored style's layout keys in scale order, '' when it has
 *  none, so an unstyled opener keeps its bytes (PS12). */
export function layoutAttributeText(style: unknown): string {
  if (style === undefined) return '';
  const clean = sanitizeBlockStyle(style) as Record<string, unknown>;
  const pairs: string[] = [];
  for (const key of LAYOUT_STYLE_KEYS) {
    if (clean[key] !== undefined) pairs.push(`${key}=${String(clean[key])}`);
  }
  return pairs.length === 0 ? '' : ` {${pairs.join(' ')}}`;
}
