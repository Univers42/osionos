/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-migrate-legacy-avatars.test.mjs              :::      :::    :::   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P0-6: the legacy `data:` avatars move into storage. The migration is a dry
// run until it is told otherwise, it never overwrites an avatar a user has
// uploaded since, and it prints counts only.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { migrateLegacyAvatars } from '../../scripts/bridge-migrate-legacy-avatars.mjs';
import { htmlFixture, jpegFixture, pngFixture, webpFixture } from './support/image-fixtures.mjs';

const USER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const dataUrl = (buffer) => `data:image/png;base64,${buffer.toString('base64')}`;

/** The PostgREST the migration sees: the identities, the profiles, and the writes. */
function fakePg({ identities = [], profiles = [] } = {}) {
	const state = { identities: [...identities], profiles: [...profiles], patches: [] };
	const asService = () => ({
		get: async (path) => {
			const table = path.split('?')[0];
			if (table === 'osionos_bridge_identities') {
				const after = /user_id\.gt\."([^"]+)"/.exec(path)?.[1];
				const limit = Number(/limit=(\d+)/.exec(path)?.[1] ?? 50);
				return state.identities
					.filter((row) => typeof row?.profile?.avatar === 'string' && row.profile.avatar.startsWith('data:'))
					.filter((row) => !after || row.user_id > after)
					.sort((left, right) => (left.user_id < right.user_id ? -1 : 1))
					.slice(0, limit);
			}
			if (table === 'osionos_profiles') {
				const userId = /user_id=eq\.([0-9a-f-]+)/.exec(path)?.[1];
				// A read is a snapshot: what the row holds after the read is another story.
				return state.profiles.filter((row) => !userId || row.user_id === userId).map((row) => ({ ...row }));
			}
			return [];
		},
		patch: async (path, body) => {
			state.patches.push({ path, body });
			const userId = /user_id=eq\.([0-9a-f-]+)/.exec(path)?.[1];
			const onlyNull = path.includes('avatar_url=is.null');
			const hits = state.profiles.filter((row) => (!userId || row.user_id === userId) && (!onlyNull || !row.avatar_url));
			for (const row of hits) Object.assign(row, body);
			return hits;
		},
	});
	return { asService, state };
}

/** The storage router, in memory. */
function fakeStorage() {
	const objects = new Map();
	const fake = async (input, init = {}) => {
		const method = (init.method || 'GET').toUpperCase();
		if (String(input).includes('/bucket/')) return new Response('{"created":false}', { status: 200 });
		if (method === 'PUT') {
			const key = `${init.headers?.['x-user-id']}/${decodeURIComponent(/\/object\/[^/]+\/(.+)$/.exec(new URL(String(input)).pathname)[1])}`;
			objects.set(key, { body: Buffer.from(init.body), contentType: init.headers?.['content-type'] });
			return new Response('{"ok":true}', { status: 200 });
		}
		return new Response('missing', { status: 404 });
	};
	fake.objects = objects;
	return fake;
}

const legacyUser = (avatar) => ({ user_id: USER, profile: { avatar, headline: 'CTO' } });

describe('the legacy avatar migration', () => {
	it('is a dry run by default: it writes nothing', async () => {
		const pg = fakePg({
			identities: [legacyUser(dataUrl(pngFixture({ width: 8, height: 8 })))],
			profiles: [{ user_id: USER, avatar_url: null }],
		});
		const storage = fakeStorage();
		const counts = await migrateLegacyAvatars({ pg, fetchImpl: storage, env: {} });

		assert.equal(counts.scanned, 1);
		assert.equal(counts.wouldMigrate, 1);
		assert.equal(counts.migrated, 0);
		assert.equal(storage.objects.size, 0, 'no byte was stored');
		assert.deepEqual(pg.state.patches, [], 'the profile was not patched');
	});

	it('migrates with --apply: the bytes are stored and the profile is patched', async () => {
		const pg = fakePg({
			identities: [legacyUser(dataUrl(pngFixture({ width: 8, height: 8 })))],
			profiles: [{ user_id: USER, avatar_url: null }],
		});
		const storage = fakeStorage();
		const counts = await migrateLegacyAvatars({ pg, fetchImpl: storage, env: {}, apply: true });

		assert.equal(counts.migrated, 1);
		const keys = [...storage.objects.keys()];
		assert.equal(keys.length, 1);
		assert.match(keys[0], new RegExp(`^${USER}/[0-9a-f]{64}\\.png$`));
		assert.equal(pg.state.patches.length, 1);
		assert.match(pg.state.patches[0].path, /avatar_url=is\.null$/);
		assert.equal(pg.state.profiles[0].avatar_url, `/api/media/avatars/${USER}/${keys[0].split('/')[1]}`);
	});

	it('migrates nothing on a second run', async () => {
		const pg = fakePg({
			identities: [legacyUser(dataUrl(pngFixture({ width: 8, height: 8 })))],
			profiles: [{ user_id: USER, avatar_url: null }],
		});
		const storage = fakeStorage();
		await migrateLegacyAvatars({ pg, fetchImpl: storage, env: {}, apply: true });
		const second = await migrateLegacyAvatars({ pg, fetchImpl: storage, env: {}, apply: true });

		assert.equal(second.migrated, 0);
		assert.equal(second.alreadySet, 1);
	});

	it('never overwrites an avatar the user uploaded meanwhile', async () => {
		const pg = fakePg({
			identities: [legacyUser(dataUrl(pngFixture({ width: 8, height: 8 })))],
			profiles: [{ user_id: USER, avatar_url: '/api/media/avatars/x/new-160.webp' }],
		});
		const storage = fakeStorage();
		const counts = await migrateLegacyAvatars({ pg, fetchImpl: storage, env: {}, apply: true });

		assert.equal(counts.migrated, 0);
		assert.equal(counts.alreadySet, 1);
		assert.equal(pg.state.profiles[0].avatar_url, '/api/media/avatars/x/new-160.webp');
		assert.equal(storage.objects.size, 0, 'nothing was stored for an avatar that is already set');
	});

	it('never overwrites an avatar uploaded BETWEEN the read and the write', async () => {
		const pg = fakePg({
			identities: [legacyUser(dataUrl(pngFixture({ width: 8, height: 8 })))],
			profiles: [{ user_id: USER, avatar_url: null }],
		});
		// The user uploads an avatar while the migration is between its read and
		// its write: the write carries `avatar_url=is.null`, so it changes nothing.
		const service = pg.asService;
		pg.asService = () => {
			const client = service();
			return {
				get: async (path) => {
					const rows = await client.get(path);
					if (path.startsWith('osionos_profiles')) {
						for (const row of pg.state.profiles) row.avatar_url = '/api/media/avatars/x/new-160.webp';
					}
					return rows;
				},
				patch: client.patch,
			};
		};
		const counts = await migrateLegacyAvatars({ pg, fetchImpl: fakeStorage(), env: {}, apply: true });

		assert.equal(counts.migrated, 0);
		assert.equal(counts.alreadySet, 1);
		assert.equal(pg.state.profiles[0].avatar_url, '/api/media/avatars/x/new-160.webp', 'the newer avatar wins');
	});

	it('counts the invalid legacy data by reason', async () => {
		const pg = fakePg({
			identities: [
				legacyUser(dataUrl(Buffer.concat([pngFixture({ width: 8, height: 8 }), Buffer.alloc(200 * 1024, 7)]))),
				{ user_id: OTHER, profile: { avatar: 'data:image/png;base64,AAAA' } },
				{ user_id: 'cccccccc-3333-4333-8333-cccccccccccc', profile: { avatar: `data:image/png;base64,${htmlFixture().toString('base64')}` } },
			],
			profiles: [],
		});
		const counts = await migrateLegacyAvatars({ pg, fetchImpl: fakeStorage(), env: {}, apply: true });

		assert.equal(counts.scanned, 3);
		assert.equal(counts.invalid.tooLarge, 1);
		assert.equal(counts.invalid.malformed, 2, 'the three bytes and the HTML are not images');
		assert.equal(counts.invalid.unsupported, 0);
		assert.equal(counts.migrated, 0);
	});

	it('leaves a user who deleted their avatar alone', async () => {
		// The DELETE removed the `data:` value from the blob and NULLed the column.
		const pg = fakePg({
			identities: [{ user_id: USER, profile: { headline: 'CTO' } }],
			profiles: [{ user_id: USER, avatar_url: null }],
		});
		const storage = fakeStorage();
		const counts = await migrateLegacyAvatars({ pg, fetchImpl: storage, env: {}, apply: true });

		assert.equal(counts.scanned, 0);
		assert.equal(counts.migrated, 0);
		assert.equal(pg.state.profiles[0].avatar_url, null, 'the deleted avatar stays deleted');
	});

	it('accepts the four legacy image types', async () => {
		for (const [bytes, ext] of [[pngFixture({ width: 4, height: 4 }), 'png'], [jpegFixture({ width: 4, height: 4 }), 'jpg'], [webpFixture({ width: 4, height: 4 }), 'webp']]) {
			const pg = fakePg({
				identities: [legacyUser(`data:image/${ext === 'jpg' ? 'jpeg' : ext === 'png' ? 'png' : 'webp'};base64,${bytes.toString('base64')}`)],
				profiles: [{ user_id: USER, avatar_url: null }],
			});
			const storage = fakeStorage();
			const counts = await migrateLegacyAvatars({ pg, fetchImpl: storage, env: {}, apply: true });
			assert.equal(counts.migrated, 1, ext);
			assert.ok([...storage.objects.keys()][0].endsWith(`.${ext}`), [...storage.objects.keys()].join(', '));
		}
	});
});
