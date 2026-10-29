/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   banner-variant.test.ts                              :::      :::    :::   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P1-6-d: the banner is cropped to 3:1 in the browser; the bridge refuses any size but 1500x500.

import assert from 'node:assert/strict';
import test from 'node:test';

import { BANNER_CAP, bannerCropRect, buildBannerPayload } from '@/features/settings/profile/bannerVariant';

const CROPS: Array<[string, number, number, { x: number; y: number; width: number; height: number }]> = [
  ['a square keeps the full width', 900, 900, { x: 0, y: 300, width: 900, height: 300 }],
  ['a wide source keeps the full height', 3000, 500, { x: 750, y: 0, width: 1500, height: 500 }],
  ['an exact 3:1 source is untouched', 1500, 500, { x: 0, y: 0, width: 1500, height: 500 }],
  ['a tall source is cut top and bottom', 600, 1800, { x: 0, y: 800, width: 600, height: 200 }],
];

for (const [name, width, height, expected] of CROPS) {
  test(`the crop rectangle is 3:1 and centred: ${name}`, () => {
    const crop = bannerCropRect(width, height);
    assert.deepEqual(crop, expected);
    assert.equal(crop.width / crop.height, 3);
  });
}

test('the payload is the first quality under the 400 KB cap, as raw base64', async () => {
  const sizes = [BANNER_CAP + 1, 5000];
  const asked: number[] = [];
  const payload = await buildBannerPayload(async (width) => {
    asked.push(width);
    return { type: 'image/webp', bytes: new Uint8Array(sizes.shift() ?? 1) };
  });
  assert.deepEqual(asked, [1500, 1500]);
  assert.equal(Buffer.from(payload, 'base64').length, 5000);
});

test('a browser that answers another type falls back to JPEG', async () => {
  const types: string[] = [];
  await buildBannerPayload(async (_width, type) => {
    types.push(type);
    return { type: type === 'image/webp' ? 'image/png' : type, bytes: new Uint8Array(10) };
  });
  assert.deepEqual(types, ['image/webp', 'image/jpeg']);
});

test('an image that never fits the cap is refused', async () => {
  await assert.rejects(buildBannerPayload(async () => ({ type: 'image/webp', bytes: new Uint8Array(BANNER_CAP + 1) })));
});
