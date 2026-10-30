/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-avatar.test.mjs                             :::      :::    :::   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P0-6: the avatar bytes live in storage and the profile holds the path. The
// upload is checked (WebP or JPEG, exactly square, under its cap), stripped of
// its metadata, stored content-addressed, and the profile is patched with ONE
// path. The delete clears the profile AND the legacy blob, so a later migration
// cannot restore an avatar the user removed.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IDS, harnessConfig, send, sessionHeaders } from './support/bridge-harness.mjs';
import { avatarBridge } from './support/avatar-storage.mjs';
import {
	htmlFixture,
	hugePngFixture,
	jpegFixture,
	jpegSegment,
	pngFixture,
	webpChunk,
	webpFixture,
} from './support/image-fixtures.mjs';
import { imageInfo } from '../../scripts/bridge-image-meta.mjs';

const config = harnessConfig();
const asA = sessionHeaders(config, IDS.userA, IDS.homeA);
const SIZES = [64, 160, 460];

const base64 = (buffer) => buffer.toString('base64');

/** A body of three square WebP variants, the shape the client posts. */
function variantBody(sizes = { 64: 64, 160: 160, 460: 460 }, format = 'webp') {
	const build = format === 'webp'
		? (size) => webpFixture({ width: size, height: size })
		: (size) => jpegFixture({ width: size, height: size });
	return { variants: Object.fromEntries(Object.entries(sizes).map(([key, size]) => [key, base64(build(size))])) };
}

const writesTo = (mock, table) => mock.calls.filter((call) => call.method === 'PATCH' && call.table === table);

describe('POST /api/profile/avatar', () => {
	it('stores the three variants and patches the profile with the 160px one', async () => {
		await avatarBridge(async ({ base, storage, mock }) => {
			const result = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(variantBody()) });
			assert.equal(result.status, 201, result.text);

			const keys = [...storage.objects.keys()].map((key) => key.split('/')[1]);
			assert.equal(keys.length, 3, keys.join(', '));
			const sha = keys[0].split('-')[0];
			assert.match(sha, /^[0-9a-f]{64}$/);
			assert.deepEqual(keys.sort(), [`${sha}-160.webp`, `${sha}-460.webp`, `${sha}-64.webp`].sort());

			const patches = writesTo(mock, 'osionos_profiles');
			assert.equal(patches.length, 1);
			assert.equal(patches[0].body.avatar_url, `/api/media/avatars/${IDS.userA}/${sha}-160.webp`);
			assert.equal(result.body.avatarPath, `/api/media/avatars/${IDS.userA}/${sha}-160.webp`);
		});
	});

	it('accepts a JPEG set as well as a WebP one', async () => {
		await avatarBridge(async ({ base, storage }) => {
			const result = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(variantBody(undefined, 'jpeg')) });
			assert.equal(result.status, 201, result.text);
			assert.ok([...storage.objects.keys()].some((key) => key.endsWith('.jpg')), [...storage.objects.keys()].join(', '));
		});
	});

	it('refuses a variant that is not square at its size, writing nothing', async () => {
		await avatarBridge(async ({ base, storage, mock }) => {
			const result = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(variantBody({ 64: 32, 160: 160, 460: 460 })) });
			assert.equal(result.status, 422, result.text);
			assert.equal(storage.stats().puts, 0);
			assert.equal(writesTo(mock, 'osionos_profiles').length, 0);
		});
	});

	it('refuses a variant that is not square, writing nothing', async () => {
		await avatarBridge(async ({ base, storage, mock }) => {
			const body = variantBody();
			body.variants['64'] = base64(webpFixture({ width: 64, height: 32 }));
			const result = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(body) });
			assert.equal(result.status, 422, result.text);
			assert.equal(storage.stats().puts, 0);
			assert.equal(writesTo(mock, 'osionos_profiles').length, 0);
		});
	});

	it('refuses a variant over its cap, writing nothing', async () => {
		await avatarBridge(async ({ base, storage, mock }) => {
			const body = variantBody();
			// A 460px variant padded past its 300KB cap: the bytes are still a WebP.
			body.variants['460'] = base64(Buffer.concat([webpFixture({ width: 460, height: 460 }), Buffer.alloc(300 * 1024, 7)]));
			const result = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(body) });
			assert.equal(result.status, 422, result.text);
			assert.equal(storage.stats().puts, 0);
			assert.equal(writesTo(mock, 'osionos_profiles').length, 0);
		});
	});

	// #171: three variants at their caps are ~539KB of base64, past the old 512KB body limit,
	// so a set the route accepts variant by variant was refused whole with a 413.
	it('takes a set whose every variant sits at its cap', async () => {
		await avatarBridge(async ({ base }) => {
			const caps = { 64: 24 * 1024, 160: 80 * 1024, 460: 300 * 1024 };
			const body = { variants: Object.fromEntries(SIZES.map((size) => {
				const image = webpFixture({ width: size, height: size });
				return [String(size), base64(Buffer.concat([image, Buffer.alloc(caps[size] - image.length, 7)]))];
			})) };
			const result = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(body) });
			assert.equal(result.status, 201, result.text);
		});
	});

	it('refuses SVG and HTML bytes, writing nothing', async () => {
		await avatarBridge(async ({ base, storage, mock }) => {
			for (const bytes of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), htmlFixture()]) {
				const body = variantBody();
				body.variants['64'] = base64(bytes);
				const result = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(body) });
				assert.equal(result.status, 415, result.text);
			}
			assert.equal(storage.stats().puts, 0);
			assert.equal(writesTo(mock, 'osionos_profiles').length, 0);
		});
	});

	it('refuses a body that is neither the variants nor the legacy data URL', async () => {
		await avatarBridge(async ({ base, storage }) => {
			for (const body of [{}, { variants: {} }, { variants: { 64: 'x' } }, { variants: { ...variantBody().variants, 512: 'AAAA' } }]) {
				const result = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(body) });
				assert.equal(result.status, 422, result.text);
			}
			assert.equal(storage.stats().puts, 0);
		});
	});

	it('still accepts the legacy data URL of a cached client', async () => {
		await avatarBridge(async ({ base, storage, mock }) => {
			const result = await send(base, '/api/profile/avatar', asA, {
				method: 'POST',
				body: JSON.stringify({ dataUrl: `data:image/png;base64,${base64(pngFixture({ width: 8, height: 8 }))}` }),
			});
			assert.equal(result.status, 201, result.text);
			const keys = [...storage.objects.keys()].map((key) => key.split('/')[1]);
			assert.equal(keys.length, 1, keys.join(', '));
			assert.match(keys[0], /^[0-9a-f]{64}\.png$/);
			const patches = writesTo(mock, 'osionos_profiles');
			assert.equal(patches.length, 1);
			assert.equal(patches[0].body.avatar_url, `/api/media/avatars/${IDS.userA}/${keys[0]}`);
		});
	});

	it('refuses the eleventh upload of an hour', async () => {
		await avatarBridge(async ({ base }) => {
			let last = null;
			for (let run = 0; run < 11; run += 1) {
				last = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(variantBody()) });
			}
			assert.equal(last.status, 429, last.text);
		});
	});

	it('stores the bytes without their metadata', async () => {
		const exif = jpegSegment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from('GPSLatitude 51/1 30/1 0/1', 'latin1')]));
		const variants = Object.fromEntries(SIZES.map((size) => [size, base64(jpegFixture({ width: size, height: size, extra: [exif] }))]));
		await avatarBridge(async ({ base, storage }) => {
			const result = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify({ variants }) });
			assert.equal(result.status, 201, result.text);
			for (const object of storage.objects.values()) {
				assert.equal(object.body.includes(Buffer.from('Exif', 'latin1')), false, 'the EXIF block is gone');
				assert.equal(object.body.includes(Buffer.from('GPSLatitude', 'latin1')), false, 'the GPS payload is gone');
				assert.equal(imageInfo(object.body).type, 'image/jpeg', 'the image is still the image');
			}
		});
	});

	it('stores the WebP without its EXIF and XMP chunks', async () => {
		const variants = Object.fromEntries(SIZES.map((size) => [size, base64(webpFixture({
			width: size,
			height: size,
			kind: 'VP8X',
			flags: 0x08 | 0x04,
			extra: [webpChunk('EXIF', Buffer.from('Exif data', 'latin1')), webpChunk('XMP ', Buffer.from('<x:xmpmeta/>', 'latin1'))],
		}))]));
		await avatarBridge(async ({ base, storage }) => {
			const result = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify({ variants }) });
			assert.equal(result.status, 201, result.text);
			for (const object of storage.objects.values()) {
				assert.equal(object.body.includes(Buffer.from('Exif data', 'latin1')), false, 'the EXIF chunk is gone');
				assert.equal(object.body.includes(Buffer.from('xmpmeta', 'latin1')), false, 'the XMP chunk is gone');
				assert.equal(imageInfo(object.body).type, 'image/webp');
			}
		});
	});

	it('refuses a legacy avatar whose canvas is bigger than an avatar may be', async () => {
		for (const [name, bytes] of [
			['a PNG of 4294967295 pixels', hugePngFixture()],
			['a WebP of 16384 pixels', webpFixture({ width: 16384, height: 16384, kind: 'VP8X' })],
		]) {
			await avatarBridge(async ({ base, storage, mock }) => {
				const result = await send(base, '/api/profile/avatar', asA, {
					method: 'POST',
					body: JSON.stringify({ dataUrl: `data:image/png;base64,${base64(bytes)}` }),
				});
				assert.equal(result.status, 422, `${name}: ${result.text}`);
				assert.equal(result.body.code, 'invalid_image', name);
				assert.equal(storage.stats().puts, 0, name);
				assert.equal(writesTo(mock, 'osionos_profiles').length, 0, name);
			});
		}
	});

	it('answers 404 when the account has no profile row to hold the avatar', async () => {
		await avatarBridge(async ({ base }) => {
			const result = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(variantBody()) });
			assert.equal(result.status, 404, result.text);
			assert.equal(result.body.code, 'profile_missing', result.text);
		}, { profiles: [] });
	});
});

describe('DELETE /api/profile/avatar', () => {
	it('clears the profile column AND the legacy blob', async () => {
		const identities = [{
			user_id: IDS.userA,
			display_name: 'Alice',
			profile: { avatar: 'data:image/png;base64,AAAA', headline: 'CTO' },
		}];
		await avatarBridge(async ({ base, mock }) => {
			const result = await send(base, '/api/profile/avatar', asA, { method: 'DELETE' });
			assert.equal(result.status, 204, result.text);

			const profilePatches = writesTo(mock, 'osionos_profiles');
			assert.equal(profilePatches.length, 1);
			assert.equal(profilePatches[0].body.avatar_url, null);

			const identityPatches = writesTo(mock, 'osionos_bridge_identities');
			assert.equal(identityPatches.length, 1);
			assert.equal('avatar' in identityPatches[0].body.profile, false);
			assert.equal(identityPatches[0].body.profile.headline, 'CTO', 'the rest of the blob stays');
		}, { identities });
	});

	it('removes the stored objects: the old URL answers 404', async () => {
		await avatarBridge(async ({ base, storage }) => {
			const uploaded = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(variantBody()) });
			assert.equal(uploaded.status, 201, uploaded.text);
			const key = uploaded.body.avatarPath.split('/').pop();
			assert.equal(storage.objects.size, 3, 'the three variants are stored');

			const deleted = await send(base, '/api/profile/avatar', asA, { method: 'DELETE' });
			assert.equal(deleted.status, 204, deleted.text);
			assert.equal(storage.objects.size, 0, 'the stored objects are gone');

			const res = await fetch(`${base}${uploaded.body.avatarPath}`);
			assert.equal(res.status, 404);
			assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
		});
	});
});

describe('GET /api/media/avatars/:userId/:key', () => {
	const sha = 'a'.repeat(64);

	it('serves the bytes with the sandbox headers and an immutable cache', async () => {
		await avatarBridge(async ({ base, storage }) => {
			const uploaded = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(variantBody()) });
			const key = uploaded.body.avatarPath.split('/').pop();
			const stored = storage.objects.get(`${IDS.userA}/${key}`);

			const res = await fetch(`${base}/api/media/avatars/${IDS.userA}/${key}`);
			assert.equal(res.status, 200);
			assert.equal(res.headers.get('content-type'), 'image/webp');
			assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
			assert.match(res.headers.get('content-security-policy') ?? '', /sandbox/);
			assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
			assert.ok(res.headers.get('etag'));
			assert.deepEqual(Buffer.from(await res.arrayBuffer()), stored.body);
		});
	});

	it('answers 304 on a matching ETag', async () => {
		await avatarBridge(async ({ base }) => {
			const uploaded = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(variantBody()) });
			const key = uploaded.body.avatarPath.split('/').pop();
			const first = await fetch(`${base}/api/media/avatars/${IDS.userA}/${key}`);
			const etag = first.headers.get('etag');
			const second = await fetch(`${base}/api/media/avatars/${IDS.userA}/${key}`, { headers: { 'if-none-match': etag } });
			assert.equal(second.status, 304);
		});
	});

	it('answers 404 for a key that is not stored', async () => {
		await avatarBridge(async ({ base, storage }) => {
			const res = await fetch(`${base}/api/media/avatars/${IDS.userA}/${sha}-160.webp`);
			assert.equal(res.status, 404);
			assert.equal(res.headers.get('x-content-type-options'), 'nosniff', 'the error body is not sniffed');
			assert.equal(storage.stats().gets, 1, 'the router was asked once');
		});
	});

	it('answers 404 for a key that does not match the pattern, without asking the router', async () => {
		await avatarBridge(async ({ base, storage }) => {
			for (const key of ['not-a-key', `${sha}.exe`, `${sha}-12.webp`, `${sha}-160.webp/../x`]) {
				const res = await fetch(`${base}/api/media/avatars/${IDS.userA}/${key}`);
				assert.equal(res.status, 404, key);
				assert.equal(res.headers.get('x-content-type-options'), 'nosniff', key);
			}
			assert.equal(storage.stats().gets, 0, 'no storage call for a key that cannot exist');
		});
	});

	it('answers 404 for a user id that is not a uuid, without asking the router', async () => {
		await avatarBridge(async ({ base, storage }) => {
			for (const userId of ['not-a-uuid', '%2e%2e', '..%2f..', `${IDS.userA}%2f..`, '-'.repeat(36)]) {
				const res = await fetch(`${base}/api/media/avatars/${userId}/${sha}-160.webp`);
				assert.equal(res.status, 404, userId);
			}
			assert.equal(storage.stats().gets, 0, 'no storage call for a user id that cannot exist');
		});
	});
});
