/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   semanticColor.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/02 17:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/02 17:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export const SEMANTIC_COLORS = [
  'default',
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
] as const;

export type SemanticColor = (typeof SEMANTIC_COLORS)[number];

export interface SemanticColorStyle {
  bg: string;
  fg: string;
  border?: string;
}

const CANONICAL_COLOR_SET = new Set<string>(SEMANTIC_COLORS);

const COLOR_ALIASES: Readonly<Record<string, SemanticColor>> = {
  cyan: 'blue',
  amber: 'yellow',
  emerald: 'green',
  violet: 'purple',
  indigo: 'blue',
  teal: 'green',
  rose: 'red',
  slate: 'gray',
  zinc: 'gray',
  neutral: 'gray',
  grey: 'gray',
};

const LEGACY_TAILWIND_MAP: Readonly<Record<string, SemanticColor>> = {
  // Notion Database TAG_COLORS
  'bg-danger-surface-muted text-danger-text-tag': 'red',
  'bg-accent-muted text-accent-text-bold': 'blue',
  'bg-success-surface-muted text-success-text-tag': 'green',
  'bg-warning-surface-muted text-warning-text-tag': 'orange',
  'bg-purple-surface-muted text-purple-text-tag': 'purple',
  'bg-pink-surface-muted text-pink-text-tag': 'pink',
  'bg-cyan-surface-muted text-cyan-text-tag': 'blue',
  'bg-orange-surface-muted text-orange-text-tag': 'orange',

  // Status Editor Strings
  'bg-surface-muted': 'gray',
  'bg-accent-subtle': 'blue',
  'bg-success-surface-medium': 'green',
};

/** Check if a given string is a valid canonical SemanticColor */
export function isSemanticColor(value: unknown): value is SemanticColor {
  return typeof value === 'string' && CANONICAL_COLOR_SET.has(value);
}

/**
 * Normalizes any legacy Tailwind class string, color alias, or arbitrary string
 * to a canonical SemanticColor.
 *
 * Rules:
 * - Empty, undefined, null, or unrecognized -> 'default'
 * - Canonical colors ('gray', 'blue', 'pink', etc.) -> return as-is
 * - Legacy Tailwind tag strings (e.g. 'bg-danger-surface-muted text-danger-text-tag' -> 'red')
 * - Legacy status group strings (e.g. 'bg-surface-muted' -> 'gray', 'bg-accent-subtle' -> 'blue', 'bg-success-surface-medium' -> 'green')
 * - Aliases ('cyan' -> 'blue', 'amber' -> 'yellow', 'emerald' -> 'green', 'violet' -> 'purple')
 */
export function normalizeOptionColor(raw?: string | null): SemanticColor {
  if (!raw || typeof raw !== 'string') {
    return 'default';
  }

  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return 'default';
  }

  // 1. Direct canonical match
  if (isSemanticColor(trimmed)) {
    return trimmed;
  }

  // 2. Direct alias match
  if (Object.hasOwn(COLOR_ALIASES, trimmed)) {
    return COLOR_ALIASES[trimmed];
  }

  // 3. Known full legacy string match
  if (Object.hasOwn(LEGACY_TAILWIND_MAP, trimmed)) {
    return LEGACY_TAILWIND_MAP[trimmed];
  }

  // 4. Heuristic matching on legacy class tokens / role keywords
  if (/(?:^|[\s:-])danger(?:$|[\s:-])/.test(trimmed) || /(?:^|[\s:-])rose(?:$|[\s:-])/.test(trimmed)) {
    return 'red';
  }
  if (/(?:^|[\s:-])accent(?:$|[\s:-])/.test(trimmed) || /(?:^|[\s:-])cyan(?:$|[\s:-])/.test(trimmed) || /(?:^|[\s:-])indigo(?:$|[\s:-])/.test(trimmed)) {
    return 'blue';
  }
  if (/(?:^|[\s:-])success(?:$|[\s:-])/.test(trimmed) || /(?:^|[\s:-])emerald(?:$|[\s:-])/.test(trimmed) || /(?:^|[\s:-])teal(?:$|[\s:-])/.test(trimmed)) {
    return 'green';
  }
  if (/(?:^|[\s:-])warning(?:$|[\s:-])/.test(trimmed)) {
    return 'orange';
  }
  if (/(?:^|[\s:-])amber(?:$|[\s:-])/.test(trimmed)) {
    return 'yellow';
  }
  if (/(?:^|[\s:-])violet(?:$|[\s:-])/.test(trimmed) || /(?:^|[\s:-])purple(?:$|[\s:-])/.test(trimmed)) {
    return 'purple';
  }
  if (/(?:^|[\s:-])pink(?:$|[\s:-])/.test(trimmed)) {
    return 'pink';
  }
  if (/(?:^|[\s:-])orange(?:$|[\s:-])/.test(trimmed)) {
    return 'orange';
  }
  if (/(?:^|[\s:-])yellow(?:$|[\s:-])/.test(trimmed)) {
    return 'yellow';
  }
  if (/(?:^|[\s:-])green(?:$|[\s:-])/.test(trimmed)) {
    return 'green';
  }
  if (/(?:^|[\s:-])blue(?:$|[\s:-])/.test(trimmed)) {
    return 'blue';
  }
  if (/(?:^|[\s:-])brown(?:$|[\s:-])/.test(trimmed)) {
    return 'brown';
  }
  if (
    /(?:^|[\s:-])surface-muted(?:$|[\s:-])/.test(trimmed) ||
    /(?:^|[\s:-])gray(?:$|[\s:-])/.test(trimmed) ||
    /(?:^|[\s:-])slate(?:$|[\s:-])/.test(trimmed) ||
    /(?:^|[\s:-])zinc(?:$|[\s:-])/.test(trimmed)
  ) {
    return 'gray';
  }

  return 'default';
}

/**
 * Resolves a SemanticColor into CSS variables using the design token system.
 * Returns { bg, fg, border } styled with var(--osio-block-tint-{color}-*) or default tokens.
 */
export function semanticColorToTokens(color: SemanticColor): SemanticColorStyle {
  if (color === 'default' || !isSemanticColor(color)) {
    return {
      bg: 'var(--osio-bg-muted)',
      fg: 'var(--osio-fg-default)',
      border: 'var(--osio-border-default)',
    };
  }

  return {
    bg: `var(--osio-block-tint-${color}-bg)`,
    fg: `var(--osio-block-tint-${color}-fg)`,
  };
}
