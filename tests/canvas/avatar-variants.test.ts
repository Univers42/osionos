/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   avatar-variants.test.ts                             :::      :::    :::   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P0-6: the browser resizes (the bridge has no image library) and the bridge
// checks. The three variants, their caps and the WebP→JPEG fallback are the
// contract the two sides share.

import assert from 'node:assert/strict';
import test from 'node:test';

import { AVATAR_CAPS, AVATAR_QUALITIES, AVATAR_SIZES, buildAvatarVariants } from '@/features/settings/profile/avatarVariants';

test('the uploader produces one square variant per size the bridge stores', async () => {
  const asked: Array<{ size: number; type: string }> = [];
  const variants = await buildAvatarVariants(async (size, type) => {
    asked.push({ size, type });
    return { type: 'image/webp', bytes: new Uint8Array(120) };
  });

  assert.deepEqual(Object.keys(variants).sort(), ['160', '460', '64']);
  assert.deepEqual(asked.map((entry) => entry.size), [64, 160, 460], 'the sizes are the bridge sizes');
  assert.deepEqual(asked.map((entry) => entry.type), ['image/webp', 'image/webp', 'image/webp']);
  for (const size of AVATAR_SIZES) {
    const bytes = Buffer.from(variants[String(size)], 'base64');
    assert.equal(bytes.length, 120);
    assert.ok(bytes.length <= AVATAR_CAPS[size], `the ${size}px variant is under its cap`);
    assert.ok(!variants[String(size)].startsWith('data:'), 'the payload is raw base64');
  }
});

test('a browser that answers another type falls back to JPEG', async () => {
  const variants = await buildAvatarVariants(async (size, type) => (
    type === 'image/webp'
      ? { type: 'image/png', bytes: new Uint8Array(10) }
      : { type: 'image/jpeg', bytes: new Uint8Array(20) }
  ));
  for (const size of AVATAR_SIZES) {
    const bytes = Buffer.from(variants[String(size)], 'base64');
    assert.equal(bytes.length, 20, `the ${size}px variant is the JPEG one`);
  }
});

test('a variant that fits no quality is refused', async () => {
  await assert.rejects(
    buildAvatarVariants(async () => ({ type: 'image/webp', bytes: new Uint8Array(AVATAR_CAPS[64] + 1) })),
    /too large/i,
  );
});

test('the quality ladder is walked until the bytes fit', async () => {
  const qualities: number[] = [];
  await buildAvatarVariants(async (size, type, quality) => {
    qualities.push(quality);
    return { type: 'image/webp', bytes: new Uint8Array(AVATAR_CAPS[size] + 1) };
  }).catch(() => undefined);
  assert.deepEqual(qualities.slice(0, AVATAR_QUALITIES.length), [...AVATAR_QUALITIES]);
});
