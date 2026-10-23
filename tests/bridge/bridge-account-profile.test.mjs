/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-profile.test.mjs                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The typed profile of the account plane: the caller's own row, the write that carries an
 * If-Match, the public card of a person looked up by handle, and the isolation between
 * two users. The legacy profile route is here too, because it must keep answering exactly
 * as it did before this module existed.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { send, sessionToken, startAccountWorld, startBridgeWorld, USER_A, USER_B } from './support/account-world.mjs';
import { kvStub } from './support/kv-stub.mjs';

// The columns the account role may select (P1-1's grant), camelCased for the wire.
const OWNER_KEYS = [
	'avatarUrl', 'bannerUrl', 'bio', 'company', 'createdAt', 'directoryOptOut', 'displayName', 'headline',
	'links', 'location', 'orcid', 'patreon', 'profession', 'pronouns', 'readmePageId', 'searchDoc', 'timezone', 'updatedAt',
	'userId', 'username', 'version', 'website',
];

// The public card: the allowlist, and nothing else.
const CARD_KEYS = [
	'avatarUrl', 'bannerUrl', 'bio', 'company', 'displayName', 'headline', 'links', 'location', 'orcid',
	'patreon', 'profession', 'pronouns', 'timezone', 'userId', 'username', 'website',
];

const REDUCED_KEYS = ['avatarUrl', 'displayName', 'userId', 'username'];

function profileOf(userId, overrides = {}) {
	return {
		user_id: userId, display_name: 'Ada Lovelace', username: 'ada', pronouns: 'she/her',
		headline: 'Mathematician', bio: 'The first programmer.', location: 'London',
		company: 'Analytical Engines', website: 'https://example.com/ada',
		links: ['https://example.com/ada/papers'], timezone: 'Europe/London',
		orcid: '0000-0002-1825-0097', patreon: 'ada',
		avatar_url: 'https://cdn.example.com/ada.png', banner_url: 'https://cdn.example.com/ada-banner.png',
		directory_opt_out: false, version: 1, readme_page_id: null,
		created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
		search_doc: "'first':3 'programmer':2",
		profession: 'developer',
		...overrides,
	};
}

const TWO_PROFILES = () => [profileOf(USER_A), profileOf(USER_B, { username: 'bob', display_name: 'Bob Stone' })];

/** A world with the two profiles, the session of the caller and the store behind it. */
async function world(t, { rows = {}, fail = null, kv } = {}) {
	const built = await startAccountWorld(t, { rows: { profiles: TWO_PROFILES(), ...rows }, fail, kv });
	return { ...built, token: sessionToken(built.config, USER_A) };
}

/** The profile write, with the If-Match the client sends. */
const writeProfile = (base, token, body, version = '1') => send(base, '/api/account/profile', {
	method: 'PATCH', token, headers: { 'if-match': `"${version}"` }, body,
});

describe('GET /api/account/profile', () => {
	it('answers the caller\'s own row and its version as an ETag', async (t) => {
		const { base, token } = await world(t);
		const response = await send(base, '/api/account/profile', { token });
		assert.equal(response.status, 200);
		assert.equal(response.body.userId, USER_A);
		assert.equal(response.body.displayName, 'Ada Lovelace');
		assert.equal(response.body.version, 1);
		assert.equal(response.headers.get('etag'), '"1"');
	});

	it('answers every column the account role may select, camelCased, and nothing else', async (t) => {
		const { base, token } = await world(t);
		const response = await send(base, '/api/account/profile', { token });
		assert.deepEqual(Object.keys(response.body).sort(), OWNER_KEYS);
	});

	it('answers 404 profile_missing when the row is not there yet', async (t) => {
		const { base, token } = await world(t, { rows: { profiles: [] } });
		const response = await send(base, '/api/account/profile', { token });
		assert.equal(response.status, 404);
		assert.equal(response.body.code, 'profile_missing');
	});

	it('answers 503 account_plane_unavailable when the plane is down', async (t) => {
		const { base, token } = await world(t, {
			fail: (call) => (call.table === 'osionos_profiles' ? { status: 401, body: { message: 'no role' } } : null),
		});
		const response = await send(base, '/api/account/profile', { token });
		assert.equal(response.status, 503);
		assert.equal(response.body.code, 'account_plane_unavailable');
	});
});

describe('PATCH /api/account/profile', () => {
	it('writes with the right If-Match and moves the version by one', async (t) => {
		const { base, token, store } = await world(t);
		const response = await writeProfile(base, token, { headline: 'Analyst' });
		assert.equal(response.status, 200);
		assert.equal(response.body.headline, 'Analyst');
		assert.equal(response.body.version, 2);
		assert.equal(response.headers.get('etag'), '"2"');
		assert.equal(store.rows('osionos_profiles')[0].version, 2);
	});

	it('writes with the owner and the version in the filter', async (t) => {
		const { base, token, store } = await world(t);
		await writeProfile(base, token, { headline: 'Analyst' });
		const write = store.callsTo('osionos_profiles').find((call) => call.method === 'PATCH');
		assert.equal(write.params.get('user_id'), `eq.${USER_A}`);
		assert.equal(write.params.get('version'), 'eq.1');
		assert.match(write.prefer, /return=representation/);
	});

	it('answers 428 precondition_required without an If-Match', async (t) => {
		const { base, token, store } = await world(t);
		const response = await send(base, '/api/account/profile', { method: 'PATCH', token, body: { headline: 'Analyst' } });
		assert.equal(response.status, 428);
		assert.equal(response.body.code, 'precondition_required');
		assert.equal(store.rows('osionos_profiles')[0].headline, 'Mathematician');
	});

	it('answers 422 field_not_editable for username, which is P1-2b\'s', async (t) => {
		const { base, token } = await world(t);
		const response = await writeProfile(base, token, { username: 'ada2' });
		assert.equal(response.status, 422);
		assert.equal(response.body.code, 'field_not_editable');
		assert.equal(response.body.field, 'username');
	});

	it('answers 422 field_not_editable for a key that is not a profile column', async (t) => {
		const { base, token } = await world(t);
		const response = await writeProfile(base, token, { email: 'ada@example.com' });
		assert.equal(response.status, 422);
		assert.equal(response.body.code, 'field_not_editable');
		assert.equal(response.body.field, 'email');
	});

	it('answers 422 invalid_field naming the column of a CHECK violation, with no SQL in the body', async (t) => {
		const { base, token } = await world(t);
		const response = await writeProfile(base, token, { headline: 'x'.repeat(201) });
		assert.equal(response.status, 422);
		assert.equal(response.body.code, 'invalid_field');
		assert.equal(response.body.field, 'headline');
		assert.doesNotMatch(response.text, /violates|check constraint|SQLSTATE|23514|osionos_profiles/i);
	});

	it('answers 409 when the database refuses the value as a duplicate', async (t) => {
		const { base, token } = await world(t, {
			fail: (call) => (call.method === 'PATCH' && call.table === 'osionos_profiles'
				? { status: 409, body: { code: '23505', message: 'duplicate key value violates unique constraint "osionos_profiles_username_lower_uidx"' } }
				: null),
		});
		const response = await writeProfile(base, token, { headline: 'Analyst' });
		assert.equal(response.status, 409);
		assert.equal(response.body.code, 'profile_conflict');
		assert.doesNotMatch(response.text, /duplicate key|unique constraint|osionos_profiles/i);
	});

	it('lets exactly one of two concurrent writes with the same If-Match through', async (t) => {
		const { base, token, store } = await world(t);
		const [first, second] = await Promise.all([
			writeProfile(base, token, { headline: 'First' }),
			writeProfile(base, token, { headline: 'Second' }),
		]);
		assert.deepEqual([first.status, second.status].sort(), [200, 412]);
		const loser = first.status === 412 ? first : second;
		assert.equal(loser.body.code, 'version_mismatch');
		assert.equal(loser.body.version, 2);
		assert.equal(loser.body.profile.displayName, 'Ada Lovelace');
		assert.equal(store.rows('osionos_profiles')[0].version, 2);
	});

	it('answers 429 with retryAfterSeconds on the 61st write of a minute', async (t) => {
		const { base, token } = await world(t, { kv: kvStub() });
		for (let attempt = 0; attempt < 60; attempt += 1) {
			const written = await writeProfile(base, token, { headline: `Revision ${attempt}` }, String(attempt + 1));
			assert.equal(written.status, 200, `write ${attempt + 1} answers ${written.status}`);
		}
		const limited = await writeProfile(base, token, { headline: 'One too many' }, '61');
		assert.equal(limited.status, 429);
		assert.equal(limited.body.code, 'rate_limited');
		assert.equal(limited.body.retryAfterSeconds, 60);
	});

	it('reads and writes through the per-user token, never the service key', async (t) => {
		const { base, token, store } = await world(t);
		await send(base, '/api/account/profile', { token });
		await writeProfile(base, token, { headline: 'Analyst' });
		const calls = store.callsTo('osionos_profiles');
		assert.ok(calls.length >= 2);
		for (const call of calls) {
			assert.equal(call.claims?.aud, 'osionos-account');
			assert.equal(call.claims?.role, 'osionos_account_user');
			assert.equal(call.claims?.sub, USER_A);
			assert.notEqual(call.authorization, 'Bearer service-role-test-key');
		}
	});
});

describe('the profession on the account row', () => {
	it('carries the If-Match into the write filter and moves the version by one', async (t) => {
		const { base, token, store } = await world(t);
		const response = await writeProfile(base, token, { profession: 'teacher' }, '1');
		assert.equal(response.status, 200);
		assert.equal(response.body.profession, 'teacher');
		assert.equal(response.body.version, 2);
		assert.equal(response.headers.get('etag'), '"2"');
		const write = store.callsTo('osionos_profiles').find((call) => call.method === 'PATCH');
		assert.equal(write.params.get('version'), 'eq.1', 'the If-Match version filters the write');
		assert.equal(write.body.profession, 'teacher');
	});

	it('answers 422 invalid_field naming the profession for a value the CHECK refuses', async (t) => {
		// The 23514 comes from the database, not from the route: the constraint is named
		// after its column, so the route can name the field without the SQL.
		const { base, token } = await world(t, {
			fail: (call) => (call.method === 'PATCH' && call.table === 'osionos_profiles'
				? {
					status: 400,
					body: {
						code: '23514',
						message: 'new row for relation "osionos_profiles" violates check constraint "osionos_profiles_profession_check"',
						details: 'Failing row contains (profession)',
						hint: null,
					},
				}
				: null),
		});
		const response = await writeProfile(base, token, { profession: 'wizard' });
		assert.equal(response.status, 422);
		assert.equal(response.body.code, 'invalid_field');
		assert.equal(response.body.field, 'profession');
		assert.doesNotMatch(response.text, /violates|check constraint|SQLSTATE|23514|osionos_profiles/i);
	});

	it('clears the profession with null', async (t) => {
		const { base, token, store } = await world(t);
		const response = await writeProfile(base, token, { profession: null }, '1');
		assert.equal(response.status, 200);
		assert.equal(response.body.profession, null);
		assert.equal(store.rows('osionos_profiles')[0].profession, null);
	});

	it('answers the profession on the full card', async (t) => {
		const { base, token } = await world(t);
		const response = await send(base, '/api/users/ada', { token });
		assert.equal(response.status, 200);
		assert.equal(response.body.profession, 'developer');
	});

	it('never answers the profession on the reduced card', async (t) => {
		const { base, config } = await world(t, { rows: { profiles: [profileOf(USER_A, { directory_opt_out: true })] } });
		const response = await send(base, '/api/users/ada', { token: sessionToken(config, USER_B) });
		assert.equal(response.status, 200);
		assert.deepEqual(Object.keys(response.body).sort(), REDUCED_KEYS);
		assert.equal(response.body.profession, undefined);
	});
});

const README_ID = 'cccccccc-3333-4333-8333-cccccccccccc';
const readmePage = (overrides = {}) => ({
	id: README_ID, workspace_id: 'wwwwwwww-0000-4000-8000-000000000001', owner_id: USER_A, title: 'README',
	content: [{ id: 'b1', type: 'paragraph', content: 'Hello' }], archived_at: null, ...overrides,
});
const lookupAs = (t, viewer, rows) => world(t, { rows }).then(async ({ base, config }) => ({
	response: await send(base, '/api/users/ada', { token: sessionToken(config, viewer) }), base, config,
}));
const withReadme = (page = readmePage(), profile = {}) => ({
	profiles: [profileOf(USER_A, { readme_page_id: README_ID, ...profile })], pages: page ? [page] : [],
});

describe('the README on the account row', () => {
	it('writes readme_page_id with the If-Match and answers it on the owner row only', async (t) => {
		const { base, token, store } = await world(t);
		const response = await writeProfile(base, token, { readmePageId: README_ID });
		assert.equal(response.status, 200);
		assert.equal(response.body.readmePageId, README_ID);
		assert.equal(store.rows('osionos_profiles')[0].readme_page_id, README_ID);
		const write = store.callsTo('osionos_profiles').find((call) => call.method === 'PATCH');
		assert.equal(write.params.get('version'), 'eq.1');
	});

	it('clears the README with null', async (t) => {
		const { base, token } = await world(t, { rows: { profiles: [profileOf(USER_A, { readme_page_id: README_ID })] } });
		const response = await writeProfile(base, token, { readmePageId: null });
		assert.equal(response.status, 200);
		assert.equal(response.body.readmePageId, null);
	});

	it('answers 422 invalid_field naming readmePageId for a value that is not a UUID, and writes nothing', async (t) => {
		const { base, token, store } = await world(t);
		for (const bad of ['not-a-uuid', 7, '', {}]) {
			const response = await writeProfile(base, token, { readmePageId: bad });
			assert.equal(response.status, 422);
			assert.equal(response.body.code, 'invalid_field');
			assert.equal(response.body.field, 'readmePageId');
		}
		assert.equal(store.callsTo('osionos_profiles').filter((call) => call.method === 'PATCH').length, 0);
	});
});

describe('the README projected on GET /api/users/:username', () => {
	it('gives another viewer the blocks of the page the profile owner owns', async (t) => {
		const { response } = await lookupAs(t, USER_B, withReadme());
		assert.equal(response.status, 200);
		assert.deepEqual(response.body.readme, { pageId: README_ID, blocks: readmePage().content });
		assert.equal(response.body.readmePageId, undefined, 'the id lives only inside readme');
	});

	it('reads exactly readme_page_id, owner-scoped and not archived, through the service role', async (t) => {
		const { base, config, store } = await world(t, { rows: withReadme() });
		await send(base, '/api/users/ada', { token: sessionToken(config, USER_B) });
		const read = store.callsTo('osionos_pages')[0];
		assert.equal(read.authorization, 'Bearer service-role-test-key');
		assert.equal(read.params.get('id'), `eq.${README_ID}`);
		assert.equal(read.params.get('owner_id'), `eq.${USER_A}`);
		assert.equal(read.params.get('archived_at'), 'is.null');
		assert.equal(store.callsTo('osionos_pages').length, 1);
	});

	it('never hands over the blocks of a page the profile owner does not own', async (t) => {
		const { response } = await lookupAs(t, USER_B, withReadme(readmePage({ owner_id: USER_B })));
		assert.equal(response.status, 200);
		assert.equal(response.body.readme, undefined);
		assert.doesNotMatch(JSON.stringify(response.body), /Hello/);
	});

	it('never hands over the blocks of an archived or trashed page', async (t) => {
		const { response } = await lookupAs(t, USER_B, withReadme(readmePage({ archived_at: '2026-10-02T00:00:00.000Z' })));
		assert.equal(response.status, 200);
		assert.equal(response.body.readme, undefined);
		assert.doesNotMatch(JSON.stringify(response.body), /Hello/);
	});

	it('omits readme when the profile has none or the page is gone', async (t) => {
		const none = await lookupAs(t, USER_B, { profiles: [profileOf(USER_A)] });
		assert.equal(none.response.body.readme, undefined);
		const gone = await lookupAs(t, USER_B, withReadme(null));
		assert.equal(gone.response.body.readme, undefined);
	});

	it('answers truncated, with no blocks, over 200 KB, and the blocks at the cap', async (t) => {
		const big = readmePage({ content: [{ id: 'b1', type: 'paragraph', content: 'x'.repeat(200 * 1024 + 1) }] });
		const { response } = await lookupAs(t, USER_B, withReadme(big));
		assert.deepEqual(response.body.readme, { pageId: README_ID, truncated: true });
		const room = 200 * 1024 - JSON.stringify([{ id: 'b1', type: 'paragraph', content: '' }]).length;
		const edge = readmePage({ content: [{ id: 'b1', type: 'paragraph', content: 'x'.repeat(room) }] });
		const ok = await lookupAs(t, USER_B, withReadme(edge));
		assert.equal(ok.response.body.readme.truncated, undefined);
		assert.equal(ok.response.body.readme.blocks.length, 1);
	});

	it('gives the owner their own README', async (t) => {
		const { response } = await lookupAs(t, USER_A, withReadme());
		assert.deepEqual(response.body.readme.pageId, README_ID);
	});

	it('never carries readme on a reduced card, opted out or blocked, and reads no page for it', async (t) => {
		const optedOut = await world(t, { rows: withReadme(readmePage(), { directory_opt_out: true }) });
		const first = await send(optedOut.base, '/api/users/ada', { token: sessionToken(optedOut.config, USER_B) });
		assert.deepEqual(Object.keys(first.body).sort(), REDUCED_KEYS);
		assert.equal(optedOut.store.callsTo('osionos_pages').length, 0);
		const blocked = await world(t, { rows: { ...withReadme(), blocks: [{ blocker_id: USER_A, blocked_id: USER_B }] } });
		const second = await send(blocked.base, '/api/users/ada', { token: sessionToken(blocked.config, USER_B) });
		assert.deepEqual(Object.keys(second.body).sort(), REDUCED_KEYS);
		assert.equal(blocked.store.callsTo('osionos_pages').length, 0);
		assert.doesNotMatch(first.text + second.text, /Hello|readme/i);
	});

	it('serves the card without a README when the page read fails', async (t) => {
		const { base, config } = await world(t, {
			rows: withReadme(), fail: (call) => (call.table === 'osionos_pages' ? { status: 500, body: {} } : null),
		});
		const response = await send(base, '/api/users/ada', { token: sessionToken(config, USER_B) });
		assert.equal(response.status, 200);
		assert.equal(response.body.readme, undefined);
		assert.equal(response.body.username, 'ada');
	});
});

describe('the isolation between two users', () => {
	it('changes none of B\'s rows when A writes with B\'s version', async (t) => {
		const { base, token, store } = await world(t, {
			rows: { profiles: [profileOf(USER_A), profileOf(USER_B, { username: 'bob', display_name: 'Bob Stone', version: 7 })] },
		});
		const response = await writeProfile(base, token, { headline: 'Mine now' }, '7');
		assert.equal(response.status, 412);
		const rows = store.rows('osionos_profiles');
		assert.equal(rows.find((row) => row.user_id === USER_B).headline, 'Mathematician');
		assert.equal(rows.find((row) => row.user_id === USER_B).version, 7);
		assert.equal(rows.find((row) => row.user_id === USER_A).headline, 'Mathematician');
	});

	it('changes none of B\'s rows when A forges a user id in the body', async (t) => {
		const { base, token, store } = await world(t);
		const response = await writeProfile(base, token, { userId: USER_B, headline: 'Mine now' });
		assert.equal(response.status, 422);
		assert.equal(response.body.code, 'field_not_editable');
		const bRow = store.rows('osionos_profiles').find((row) => row.user_id === USER_B);
		assert.equal(bRow.headline, 'Mathematician');
		assert.equal(bRow.version, 1);
	});
});

describe('GET /api/users/:username', () => {
	it('answers the card of a handle whatever its case', async (t) => {
		const { base, token, store } = await world(t);
		const response = await send(base, '/api/users/AdA', { token });
		assert.equal(response.status, 200);
		assert.equal(response.body.userId, USER_A);
		assert.equal(response.body.username, 'ada');
		const read = store.callsTo('osionos_profiles')[0];
		assert.equal(read.authorization, 'Bearer service-role-test-key', 'the card is the one service-role read');
	});

	it('answers the full card with exactly the allowlist, and never a column outside it', async (t) => {
		const { base, token } = await world(t, {
			rows: { profiles: [profileOf(USER_A, { email: 'ada@example.com', settings: { theme: 'dark' }, deletion_state: 'none' })] },
		});
		const response = await send(base, '/api/users/ada', { token });
		assert.equal(response.status, 200);
		assert.deepEqual(Object.keys(response.body).sort(), CARD_KEYS);
		assert.equal(response.body.email, undefined);
		assert.doesNotMatch(response.text, /ada@example\.com|deletion_state|directoryOptOut/i);
	});

	it('answers the reduced card for another viewer when the subject opted out', async (t) => {
		const { base, config } = await world(t, { rows: { profiles: [profileOf(USER_A, { directory_opt_out: true })] } });
		const response = await send(base, '/api/users/ada', { token: sessionToken(config, USER_B) });
		assert.equal(response.status, 200);
		assert.deepEqual(Object.keys(response.body).sort(), REDUCED_KEYS);
	});

	it('answers the full card to the subject themselves, opted out or not', async (t) => {
		const { base, token } = await world(t, { rows: { profiles: [profileOf(USER_A, { directory_opt_out: true })] } });
		const response = await send(base, '/api/users/ada', { token });
		assert.equal(response.status, 200);
		assert.deepEqual(Object.keys(response.body).sort(), CARD_KEYS);
	});

	it('answers the reduced card when the subject blocked the viewer', async (t) => {
		const { base, token, store } = await world(t, { rows: { blocks: [{ blocker_id: USER_B, blocked_id: USER_A }] } });
		const response = await send(base, '/api/users/bob', { token });
		assert.equal(response.status, 200);
		assert.deepEqual(Object.keys(response.body).sort(), REDUCED_KEYS);
		assert.equal(store.callsTo('osionos_user_blocks').length, 1, 'the shared block helper reads the block list');
	});

	it('answers the same 404 for a name nobody took and for a name that is held', async (t) => {
		// The held name is in the history because that is where a released name lands. The
		// route never reads the history, so the answer cannot tell the two apart.
		const { base, token } = await world(t, {
			rows: {
				profiles: [],
				history: [{ id: 'cccccccc-3333-4333-8333-cccccccccccc', user_id: USER_B, username: 'held', changed_at: '2026-10-01T00:00:00.000Z', released_at: '2026-12-01T00:00:00.000Z' }],
			},
		});
		const unknown = await send(base, '/api/users/nobody', { token });
		const held = await send(base, '/api/users/held', { token });
		assert.equal(unknown.status, 404);
		assert.equal(held.status, 404);
		assert.equal(unknown.body.code, 'user_not_found');
		assert.equal(held.body.code, 'user_not_found');
		assert.equal(unknown.text, held.text);
	});

	it('answers 404 user_not_found through the bridge, not the generic 404', async (t) => {
		const { base, config } = await startBridgeWorld(t, { rows: { profiles: [] } });
		const response = await send(base, '/api/users/unknown', { token: sessionToken(config, USER_A) });
		assert.equal(response.status, 404);
		assert.equal(response.body.code, 'user_not_found');
	});
});

describe('the legacy profile route', () => {
	it('keeps answering PATCH /api/profile/me exactly as before', async (t) => {
		const { base, config, store } = await startBridgeWorld(t, {
			rows: {
				identities: [{
					user_id: USER_A, display_name: 'Ada Lovelace', username: 'ada', profile: { bio: 'Old bio' },
					created_at: '2026-10-01T00:00:00.000Z', last_seen_at: null, directory_opt_out: false,
				}],
			},
		});
		const response = await send(base, '/api/profile/me', {
			method: 'PATCH', token: sessionToken(config, USER_A), body: { bio: 'New bio', headline: 'Analyst' },
		});
		assert.equal(response.status, 200);
		assert.equal(response.body.ok, true);
		assert.equal(response.body.userId, USER_A);
		assert.equal(response.body.username, 'ada');
		const identity = store.rows('osionos_bridge_identities')[0];
		assert.equal(identity.profile.bio, 'New bio');
		assert.equal(identity.profile.headline, 'Analyst');
	});
});
