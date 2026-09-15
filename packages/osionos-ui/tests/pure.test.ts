import assert from 'node:assert/strict';
import test from 'node:test';

import { cx } from '../src/shared/classNames.ts';
import { parseIconValue, serializeIconValue, type IconValue } from '../src/shared/iconValue.ts';
import { applyEmojiTone, EMOJI_SKIN_TONES } from '../src/shared/emojiTone.ts';

/**
 * The kit's React components need a DOM and a renderer, so they are covered by
 * the host's e2e suite. What IS unit-testable here is the pure layer every
 * component sits on — and that layer is where a silent regression spreads
 * widest, because icon values are PERSISTED: a parse/serialize asymmetry
 * corrupts stored pages rather than just misrendering one.
 */

test('cx joins truthy values and drops the rest', () => {
  assert.equal(cx('a', 'b'), 'a b');
  assert.equal(cx('a', false, null, undefined, '', 'b'), 'a b');
  assert.equal(cx(), '');
});

test('parseIconValue tags each supported form', () => {
  assert.deepEqual(parseIconValue('icon:rocket'), { kind: 'icon', ref: 'rocket', color: undefined });
  assert.deepEqual(parseIconValue('img:https://x/a.png'), {
    kind: 'image',
    ref: 'https://x/a.png',
    color: undefined,
  });
  assert.deepEqual(parseIconValue('emoji:🚀'), { kind: 'emoji', ref: '🚀', bg: undefined });
  // A bare emoji is what legacy stored pages contain.
  assert.deepEqual(parseIconValue('🚀'), { kind: 'emoji', ref: '🚀', bg: undefined });
});

test('the legacy "url:" prefix still parses as an image', () => {
  assert.equal(parseIconValue('url:https://x/a.png')?.kind, 'image');
  assert.equal(parseIconValue('url:https://x/a.png')?.ref, 'https://x/a.png');
});

test('empty and nullish values parse to null rather than throwing', () => {
  assert.equal(parseIconValue(''), null);
  assert.equal(parseIconValue('   '), null);
  assert.equal(parseIconValue(undefined), null);
  assert.equal(parseIconValue(null), null);
});

test('colour and background suffixes are decoded, not left encoded', () => {
  assert.deepEqual(parseIconValue('icon:rocket;color=%23ff0000'), {
    kind: 'icon',
    ref: 'rocket',
    color: '#ff0000',
  });
  assert.deepEqual(parseIconValue('🚀;bg=%2300ff00'), {
    kind: 'emoji',
    ref: '🚀',
    bg: '#00ff00',
  });
});

test('icon values round-trip through parse and serialize', () => {
  // These are persisted strings: an asymmetry here corrupts saved pages.
  const stored = [
    'icon:rocket',
    'img:https://example.com/a.png',
    '🚀',
    'icon:rocket;color=%23ff0000',
    '🚀;bg=%2300ff00',
  ];
  for (const raw of stored) {
    const parsed = parseIconValue(raw);
    assert.ok(parsed, `${raw} failed to parse`);
    assert.equal(serializeIconValue(parsed), raw, `round-trip changed ${raw}`);
  }
});

test('serialize encodes a colour so it cannot collide with callout markdown', () => {
  const value: IconValue = { kind: 'icon', ref: 'rocket', color: '#ff0000' };
  // A raw '#' would break "> [!note]" style markdown — it must stay percent-encoded.
  assert.equal(serializeIconValue(value), 'icon:rocket;color=%23ff0000');
});

test('tone 0 and out-of-range tones leave the emoji unchanged', () => {
  assert.equal(applyEmojiTone('👍', 0), '👍');
  assert.equal(applyEmojiTone('👍', -1), '👍');
  assert.equal(applyEmojiTone('👍', EMOJI_SKIN_TONES.length + 1), '👍');
});

test('every tone index produces a distinct, correctly-composed emoji', () => {
  const base = '👍';
  const toned = EMOJI_SKIN_TONES.map((_, index) => applyEmojiTone(base, index + 1));

  assert.equal(new Set(toned).size, toned.length, 'two skin tones rendered identically');
  for (const [index, emoji] of toned.entries()) {
    const points = [...emoji].map((c) => c.codePointAt(0));
    assert.equal(points[0], base.codePointAt(0), 'the base code point must survive');
    assert.equal(points[1], EMOJI_SKIN_TONES[index], 'the modifier goes right after the base');
  }
});

test('a leading variation selector is replaced, not kept alongside the modifier', () => {
  // ✌️ is U+270C U+FE0F — keeping FE0F would yield an invalid RGI sequence.
  const toned = applyEmojiTone('✌️', 1);
  const points = [...toned].map((c) => c.codePointAt(0));
  assert.deepEqual(points, [0x270c, EMOJI_SKIN_TONES[0]]);
});
