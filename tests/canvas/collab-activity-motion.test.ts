/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collab-activity-motion.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Motion contract of the activity overlay (app/styles/collab-activity.css): the
 * typing dots and the edit flash. Read from the stylesheet the browser loads, so
 * the rules hold for the file as shipped. collab.css has its own stricter test
 * (collab-ink-contrast.test.ts: nothing infinite, 90-300 ms); this file is looser
 * in exactly two places, each pinned here: the flash fades over 700 ms, and the
 * typing dots loop, but only on `.collab-typing-dot`, which exists in the DOM
 * only while a member is typing.
 *
 * Caveat: a tiny CSS reader, not a cascade engine. It understands the flat rules,
 * one @media block and @keyframes this file uses; nesting or a selector list it
 * does not know is not seen (the block-count assertions fail if the shape drifts).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { FLASH_FADE_MS, FLASH_TTL_MS } from '@/features/collab/model/remoteEditFlash';

const CSS = readFileSync('src/app/styles/collab-activity.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Text between the `{` at `open` and its matching `}`. */
function balanced(css: string, open: number): string {
  let depth = 1;
  let at = open + 1;
  while (depth > 0 && at < css.length) {
    if (css[at] === '{') depth += 1;
    else if (css[at] === '}') depth -= 1;
    at += 1;
  }
  return css.slice(open + 1, at - 1);
}

function blocksOf(css: string, head: RegExp): { head: string; body: string }[] {
  const out: { head: string; body: string }[] = [];
  for (const match of css.matchAll(head)) {
    out.push({ head: match[1].trim(), body: balanced(css, match.index + match[0].length - 1) });
  }
  return out;
}

const MEDIA = blocksOf(CSS, /@media\s*([^{]+)\{/g);
const KEYFRAMES = blocksOf(CSS, /@keyframes\s+([\w-]+)\s*\{/g);
const OUTSIDE = MEDIA.reduce((rest, { body }) => rest.replace(body, ''), CSS);

/** `selector -> declarations` for the flat rules of a stylesheet fragment. */
function rulesOf(css: string): Map<string, string> {
  const flat = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  return new Map([...flat.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map(([, selector, body]) => [selector.trim(), body]));
}

test('all motion sits in one prefers-reduced-motion: no-preference block', () => {
  assert.equal(MEDIA.length, 1, 'one motion block');
  assert.equal(MEDIA[0].head, '(prefers-reduced-motion: no-preference)');
  assert.doesNotMatch(OUTSIDE, /\banimation(-name|-delay)?\s*:/, 'keyframes are declared, never applied, outside the gate');
  assert.doesNotMatch(OUTSIDE, /\btransition\s*:/);
  assert.match(MEDIA[0].body, /\banimation\s*:/);
});

test('the only infinite animation is the typing dot', () => {
  const looping = [...rulesOf(MEDIA[0].body)].filter(([, body]) => /infinite/.test(body)).map(([selector]) => selector);
  assert.deepEqual(looping, ['.collab-typing-dot']);
  assert.doesNotMatch(OUTSIDE, /infinite/);
});

test('keyframes move only opacity and transform', () => {
  assert.deepEqual(KEYFRAMES.map(({ head }) => head).sort(), ['collab-flash-fade', 'collab-typing-dot']);
  for (const { head, body } of KEYFRAMES) {
    const props = [...body.matchAll(/([\w-]+)\s*:/g)].map(([, name]) => name);
    assert.ok(props.length > 0, `${head} declares something`);
    for (const prop of props) assert.ok(['opacity', 'transform'].includes(prop), `${head} animates ${prop}`);
  }
});

test('the flash fades over FLASH_FADE_MS and the mark outlives the fade', () => {
  const flash = rulesOf(MEDIA[0].body).get('.collab-edit-flash') ?? '';
  assert.match(flash, new RegExp(`collab-flash-fade ${FLASH_FADE_MS}ms ease-out`), 'duration comes from the model constant');
  assert.match(flash, /\bboth\b/, 'fill-mode both: invisible at the end, so a late unmount shows no ghost');
  assert.ok(FLASH_TTL_MS > FLASH_FADE_MS, 'the mark lives past the end of its fade');
});

test('the still look needs no motion: a bar when reduced, a tint when motion is allowed', () => {
  const still = rulesOf(OUTSIDE);
  assert.match(still.get('.collab-edit-flash__tint') ?? '', /display:\s*none/, 'reduced motion hides the fading tint');
  assert.equal(still.has('.collab-edit-flash__bar'), false, 'and shows the 2px bar, which has no rule to hide it');
  const moving = rulesOf(MEDIA[0].body);
  assert.match(moving.get('.collab-edit-flash__tint') ?? '', /display:\s*block/);
  assert.match(moving.get('.collab-edit-flash__bar') ?? '', /display:\s*none/);
});

test('the tint share is a token, 16 percent', () => {
  assert.match(CSS, /--collab-flash-mix:\s*16%/);
});
