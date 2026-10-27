/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collab-ink-contrast.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Contrast and motion contract of the presence overlay, read from the stylesheet
 * the browser loads (app/styles/collab.css) rather than from a copy of its
 * values: every member colour carries a name flag / initials chip / follow chip
 * in its ink, in both themes, and must clear WCAG AA (4.5:1) for normal text.
 * Motion is held to the same standard: nothing infinite, only transform and
 * opacity, 90-300 ms, and only when the user has not asked for reduced motion.
 *
 * Caveat: a tiny CSS reader, not a cascade engine. It understands the flat
 * `:root {}` and `[data-theme="dark"] {}` blocks and `var()` chains that
 * collab.css uses; a selector or nesting it does not know is not seen (the
 * block-count assertions fail loudly if the file's shape drifts).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { COLLAB_PALETTE_SIZE, inkFor } from '@/features/collab/model/collabPresence';

const CSS = readFileSync('src/app/styles/collab.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const AA = 4.5;

type Tokens = Map<string, string>;

/** Custom properties declared in the single top-level block opened by `selector`. */
function tokensOf(selector: string): Tokens {
  const start = CSS.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `collab.css has a ${selector} block`);
  assert.equal(CSS.indexOf(`${selector} {`, start + 1), -1, `exactly one ${selector} block`);
  const body = CSS.slice(CSS.indexOf('{', start) + 1, CSS.indexOf('}', start));
  const out: Tokens = new Map();
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(name, value.trim());
  return out;
}

/** Dark overrides light, exactly as source order does in the browser. */
const LIGHT = tokensOf(':root');
const DARK: Tokens = new Map([...LIGHT, ...tokensOf('[data-theme="dark"]')]);

function resolve(value: string, theme: Tokens, depth = 0): string {
  assert.ok(depth < 8, `var() chain too deep or cyclic at ${value}`);
  const ref = /^var\((--[\w-]+)\)$/.exec(value);
  if (!ref) return value;
  const next = theme.get(ref[1]);
  assert.ok(next !== undefined, `${ref[1]} is declared`);
  return resolve(next, theme, depth + 1);
}

function channel(hex: string, at: number): number {
  const c = parseInt(hex.slice(at, at + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  assert.match(hex, /^#[0-9a-f]{6}$/i, `a six-digit hex, got ${hex}`);
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('collab.css declares the whole palette in both themes', () => {
  assert.equal(COLLAB_PALETTE_SIZE, 8);
  for (const [name, theme] of [['light', LIGHT], ['dark', DARK]] as const) {
    for (let slot = 1; slot <= COLLAB_PALETTE_SIZE; slot += 1) {
      assert.ok(theme.has(`--collab-${slot}`), `${name} --collab-${slot}`);
      assert.ok(theme.has(`--collab-ink-${slot}`), `${name} --collab-ink-${slot}`);
    }
  }
});

test('every member colour carries its ink at 4.5:1 or better, light and dark', () => {
  const rows: string[] = [];
  for (let slot = 1; slot <= COLLAB_PALETTE_SIZE; slot += 1) {
    const color = `var(--collab-${slot})`;
    for (const [name, theme] of [['light', LIGHT], ['dark', DARK]] as const) {
      // inkFor is the code path the flag, chip and follow chip use to pick the ink.
      const bg = resolve(color, theme);
      const fg = resolve(inkFor(color), theme);
      const got = ratio(bg, fg);
      rows.push(`${name} ${slot} ${fg} on ${bg} = ${got.toFixed(2)}`);
      assert.ok(got >= AA, `${name} --collab-${slot}: ${fg} on ${bg} is ${got.toFixed(2)}:1, needs ${AA}`);
    }
  }
  assert.equal(rows.length, 16);
});

test('the ratio helper matches known WCAG values', () => {
  assert.equal(ratio('#000000', '#ffffff').toFixed(2), '21.00');
  assert.equal(ratio('#ffffff', '#ffffff').toFixed(2), '1.00');
  assert.equal(ratio('#767676', '#ffffff').toFixed(2), '4.54', 'the textbook AA grey');
  assert.ok(ratio('#cc785c', '#ffffff') < AA, 'white on the old terracotta fails, which is why it takes deep ink');
});

/** `@media (...) { ... }` bodies, matched by brace depth. */
function mediaBlocks(css: string): { query: string; body: string }[] {
  const out: { query: string; body: string }[] = [];
  for (const match of css.matchAll(/@media\s*([^{]+)\{/g)) {
    let depth = 1;
    let at = match.index + match[0].length;
    while (depth > 0 && at < css.length) {
      if (css[at] === '{') depth += 1;
      else if (css[at] === '}') depth -= 1;
      at += 1;
    }
    out.push({ query: match[1].trim(), body: css.slice(match.index + match[0].length, at - 1) });
  }
  return out;
}

test('no animation loops forever', () => {
  assert.doesNotMatch(CSS, /infinite/);
});

test('transitions and animations exist only under prefers-reduced-motion: no-preference', () => {
  const media = mediaBlocks(CSS);
  assert.equal(media.length, 1, 'one motion block');
  assert.equal(media[0].query, '(prefers-reduced-motion: no-preference)');
  let outside = CSS;
  for (const { body } of media) outside = outside.replace(body, '');
  assert.doesNotMatch(outside, /\btransition\s*:/, 'the static fallback does not animate');
  assert.doesNotMatch(outside, /\banimation(-name)?\s*:/, 'keyframes are declared, never applied, outside the gate');
  assert.match(media[0].body, /\btransition\s*:/);
  assert.match(media[0].body, /\banimation\s*:/);
});

test('motion animates transform and opacity only, in 90-300 ms', () => {
  for (const [, list] of CSS.matchAll(/\btransition\s*:\s*([^;]+);/g)) {
    for (const part of list.split(',')) {
      const [property] = part.trim().split(/\s+/);
      assert.ok(['transform', 'opacity', 'none'].includes(property), `transition on ${property}`);
    }
  }
  const durations = [...CSS.matchAll(/(\d+)ms/g)].map((m) => Number(m[1]));
  assert.ok(durations.length >= 4, 'durations were found');
  for (const ms of durations) assert.ok(ms >= 90 && ms <= 300, `${ms}ms is outside 90-300`);
  for (const [, frames] of CSS.matchAll(/@keyframes\s+[\w-]+\s*\{([\s\S]*?\}\s*)\}/g)) {
    for (const [, property] of frames.matchAll(/([\w-]+)\s*:/g)) {
      assert.ok(['opacity', 'transform'].includes(property), `keyframe animates ${property}`);
    }
  }
});

test('the ring-in plays once and the infinite pulse is gone', () => {
  assert.match(CSS, /\.collab-ring-enter\s*\{[^}]*animation:\s*collab-ring-in 250ms ease-out;/);
  assert.doesNotMatch(readFileSync('src/app/styles/global.css', 'utf8'), /collab-pulse/);
});
