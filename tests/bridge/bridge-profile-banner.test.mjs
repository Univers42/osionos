/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-profile-banner.test.mjs                    :::      :::    :::   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// P1-6-d: the banner rides the avatar pipeline (sniff, strip, store, service PATCH) with
// one 1500x500 variant. The route is owner-only: the user id comes from the session.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IDS, harnessConfig, send, sessionHeaders } from './support/bridge-harness.mjs';
import { avatarBridge } from './support/avatar-storage.mjs';
import { gifFixture, htmlFixture, jpegFixture, jpegSegment, pngFixture, webpChunk, webpFixture } from './support/image-fixtures.mjs';
import { imageInfo } from '../../scripts/bridge-image-meta.mjs';

const config = harnessConfig();
const asA = sessionHeaders(config, IDS.userA, IDS.homeA);
const ROUTE = '/api/profile/banner';
const base64 = (buffer) => buffer.toString('base64');
const bannerBody = (bytes) => JSON.stringify({ banner: base64(bytes) });
const post = (base, body, headers = asA) => send(base, ROUTE, headers, { method: 'POST', body });
const profilePatches = (mock) => mock.calls.filter((call) => call.method === 'PATCH' && call.table === 'osionos_profiles');
const profiles = [{ user_id: IDS.userA, display_name: 'Alice', avatar_url: null, banner_url: null }];

describe('POST /api/profile/banner', () => {
	it('stores the 1500x500 variant as <sha>-banner and sets banner_url', async () => {
		await avatarBridge(async ({ base, storage, mock }) => {
			const result = await post(base, bannerBody(webpFixture({ width: 1500, height: 500 })));
			assert.equal(result.status, 201, result.text);
			const keys = [...storage.objects.keys()].map((key) => key.split('/')[1]);
			assert.equal(keys.length, 1, keys.join(', '));
			assert.match(keys[0], /^[0-9a-f]{64}-banner\.webp$/);
			assert.equal(profilePatches(mock)[0].body.banner_url, `/api/media/avatars/${IDS.userA}/${keys[0]}`);
			assert.equal(result.body.bannerPath, `/api/media/avatars/${IDS.userA}/${keys[0]}`);
		}, { profiles });
	});

	it('refuses HTML disguised as an image with 415, writing nothing', async () => {
		await avatarBridge(async ({ base, storage, mock }) => {
			const result = await post(base, bannerBody(htmlFixture()));
			assert.equal(result.status, 415, result.text);
			assert.equal(storage.stats().puts, 0);
			assert.equal(profilePatches(mock).length, 0);
		}, { profiles });
	});

	it('refuses a real PNG or GIF of the right size: only WebP and JPEG are stored', async () => {
		await avatarBridge(async ({ base, storage }) => {
			for (const bytes of [pngFixture({ width: 1500, height: 500 }), gifFixture({ width: 1500, height: 500 })]) {
				const result = await post(base, bannerBody(bytes));
				assert.equal(result.status, 415, result.text);
			}
			assert.equal(storage.stats().puts, 0);
		}, { profiles });
	});

	it('refuses a wrong size with 422', async () => {
		await avatarBridge(async ({ base, storage }) => {
			for (const [width, height] of [[1500, 501], [460, 460], [3000, 1000]]) {
				const result = await post(base, bannerBody(webpFixture({ width, height })));
				assert.equal(result.status, 422, `${width}x${height}: ${result.text}`);
			}
			assert.equal(storage.stats().puts, 0);
		}, { profiles });
	});

	it('refuses a banner over 400 KB and a body without one', async () => {
		await avatarBridge(async ({ base }) => {
			const big = webpFixture({ width: 1500, height: 500, extra: [webpChunk('JUNK', Buffer.alloc(401 * 1024))] });
			assert.equal((await post(base, bannerBody(big))).status, 422);
			assert.equal((await post(base, JSON.stringify({}))).status, 422);
		}, { profiles });
	});

	it('strips EXIF before storing', async () => {
		const exif = jpegSegment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from('GPSLatitude 51/1 30/1 0/1', 'latin1')]));
		await avatarBridge(async ({ base, storage }) => {
			const result = await post(base, bannerBody(jpegFixture({ width: 1500, height: 500, extra: [exif] })));
			assert.equal(result.status, 201, result.text);
			for (const object of storage.objects.values()) {
				assert.equal(object.body.includes(Buffer.from('GPSLatitude', 'latin1')), false);
				assert.equal(imageInfo(object.body).type, 'image/jpeg');
			}
		}, { profiles });
	});

	it('is owner only: no session is 401, and a user id in the body is ignored', async () => {
		await avatarBridge(async ({ base, mock }) => {
			assert.equal((await post(base, bannerBody(webpFixture({ width: 1500, height: 500 })), {})).status, 401);
			const body = JSON.stringify({ banner: base64(webpFixture({ width: 1500, height: 500 })), userId: IDS.userB });
			const result = await post(base, body);
			assert.equal(result.status, 201, result.text);
			const patch = profilePatches(mock)[0];
			assert.equal(patch.params.get('user_id'), `eq.${IDS.userA}`);
			assert.doesNotMatch(JSON.stringify(patch.body), new RegExp(IDS.userB));
		}, { profiles });
	});

	it('refuses the eleventh upload of an hour', async () => {
		await avatarBridge(async ({ base }) => {
			let last = null;
			for (let run = 0; run < 11; run += 1) last = await post(base, bannerBody(webpFixture({ width: 1500, height: 500 })));
			assert.equal(last.status, 429, last.text);
		}, { profiles });
	});
});

describe('DELETE /api/profile/banner', () => {
	it('clears banner_url and removes the stored object', async () => {
		await avatarBridge(async ({ base, storage, mock }) => {
			const uploaded = await post(base, bannerBody(webpFixture({ width: 1500, height: 500 })));
			const path = uploaded.body.bannerPath;
			const removed = await send(base, ROUTE, asA, { method: 'DELETE' });
			assert.equal(removed.status, 204, removed.text);
			assert.equal(storage.objects.size, 0);
			assert.equal(profilePatches(mock).at(-1).body.banner_url, null);
			const served = await fetch(`${base}${path}`);
			assert.equal(served.status, 404);
		}, { profiles });
	});
});

describe('GET /api/media/avatars/:userId/<sha>-banner.<ext>', () => {
	it('serves the banner with no session', async () => {
		await avatarBridge(async ({ base }) => {
			const uploaded = await post(base, bannerBody(webpFixture({ width: 1500, height: 500 })));
			const res = await fetch(`${base}${uploaded.body.bannerPath}`);
			assert.equal(res.status, 200);
			assert.equal(res.headers.get('content-type'), 'image/webp');
		}, { profiles });
	});
});
