/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-published-pages.test.mjs             +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The published pages the caller can see: the flag gate, the session, the throttle, the
 * owner scope of the rows, the status of each copy, and the two roles the route reads
 * with. The store behind the bridge applies the filters, so a route that asked for
 * another user's row would show it here.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signAppSessionToken } from '../../scripts/bridge-api.mjs';
import { kvStub } from './support/kv-stub.mjs';
import { createPublishedPagesStore, IN_LIST_CEILING } from './support/published-pages-postgrest.mjs';
import { USER_A, USER_B, sendJson, sessionConfig, startSessionBridge } from './support/session-world.mjs';

const PATH = '/api/account/published-pages';
const CLOCK = { at: Date.now() };
const WORKSPACE_ID = 'cccccccc-3333-4333-8333-cccccccccccc';
const PAGE_LIVE = '11111111-1111-4111-8111-111111111111';
const PAGE_OUTDATED = '22222222-2222-4222-8222-222222222222';
const PAGE_GONE = '33333333-3333-4333-8333-333333333333';
const PAGE_OTHER = '44444444-4444-4444-8444-444444444444';
const TOKEN_LIVE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const TOKEN_OUTDATED = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';
const TOKEN_GONE = '00112233445566778899aabbccddeeff';
const TOKEN_OTHER = 'fedcba98765432100123456789abcdef';

const PUBLISHED = [
	{ token: TOKEN_LIVE, page_id: PAGE_LIVE, title: 'Snapshot of the live page', icon: '📄', published_at: '2026-10-01T10:00:00.000Z', owner_id: USER_A, content: [{ type: 'paragraph', text: 'the body' }], email: 'owner@example.com' },
	{ token: TOKEN_OUTDATED, page_id: PAGE_OUTDATED, title: 'Snapshot of the old page', icon: '🕰️', published_at: '2026-10-01T10:00:00.000Z', owner_id: USER_A, content: [], email: 'owner@example.com' },
	{ token: TOKEN_GONE, page_id: PAGE_GONE, title: 'Snapshot of a deleted page', icon: null, published_at: '2026-10-01T10:00:00.000Z', owner_id: USER_A, content: [], email: 'owner@example.com' },
	{ token: TOKEN_OTHER, page_id: PAGE_OTHER, title: 'Snapshot of another user', icon: '🔒', published_at: '2026-10-01T10:00:00.000Z', owner_id: USER_B, content: [], email: 'other@example.com' },
];

const PAGES = [
	{ id: PAGE_LIVE, title: 'The live page now', icon: '📘', updated_at: '2026-10-01T09:00:00.000Z', owner_id: USER_A },
	{ id: PAGE_OUTDATED, title: 'The old page now', icon: '📙', updated_at: '2026-10-05T09:00:00.000Z', owner_id: USER_A },
	{ id: PAGE_OTHER, title: 'Another user page', icon: '🔐', updated_at: '2026-10-05T09:00:00.000Z', owner_id: USER_B },
];

/** The flag is read at call time from the environment, so a test sets it around its calls. */
async function withPublishFlag(value, run) {
	const previous = process.env.OSIONOS_PUBLISH_ENABLED;
	if (value === undefined) delete process.env.OSIONOS_PUBLISH_ENABLED;
	else process.env.OSIONOS_PUBLISH_ENABLED = value;
	try {
		return await run();
	} finally {
		if (previous === undefined) delete process.env.OSIONOS_PUBLISH_ENABLED;
		else process.env.OSIONOS_PUBLISH_ENABLED = previous;
	}
}

/** The bridge with the published pages behind it. */
async function publishedWorld(t, { published = PUBLISHED, pages = PAGES, fail = null } = {}) {
	const config = sessionConfig({ now: () => CLOCK.at });
	const store = createPublishedPagesStore({ published, pages, fail });
	const { base } = await startSessionBridge({ t, config, clock: CLOCK, store, kv: kvStub() });
	return { base, store, config };
}

/** An app session token of the caller, signed the way the bridge signs its own. */
function appToken(config, userId) {
	const { token } = signAppSessionToken({
		payload: { provider: 'prismatica', subject: userId, email: 'member@example.com', name: 'Member' },
		workspace: { _id: WORKSPACE_ID, name: 'Workspace', slug: 'workspace' },
		config,
		now: CLOCK.at,
	});
	return token;
}

describe('GET /api/account/published-pages', () => {
	it('404s with publish_disabled and reads no table when the feature is off', async (t) => {
		const { base, store, config } = await publishedWorld(t);
		const token = appToken(config, USER_A);
		await withPublishFlag(undefined, async () => {
			const response = await sendJson(base, PATH, { headers: { authorization: `Bearer ${token}` } });
			assert.equal(response.status, 404);
			assert.equal(response.body.code, 'publish_disabled');
		});
		assert.equal(store.callsTo('osionos_published_pages').length, 0, 'no snapshot is read');
		assert.equal(store.callsTo('osionos_pages').length, 0, 'no page is read');
	});

	it('answers 401 without a session, and 401 for a token that is not one', async (t) => {
		const { base, store } = await publishedWorld(t);
		await withPublishFlag('1', async () => {
			const anonymous = await sendJson(base, PATH);
			assert.equal(anonymous.status, 401);
			const forged = await sendJson(base, PATH, { headers: { authorization: 'Bearer not-a-session-token' } });
			assert.equal(forged.status, 401);
		});
		assert.equal(store.callsTo('osionos_published_pages').length, 0, 'no snapshot is read without a session');
	});

	it('lists the published rows of the caller and nobody else\'s', async (t) => {
		const { base, store, config } = await publishedWorld(t);
		const token = appToken(config, USER_A);
		await withPublishFlag('1', async () => {
			const response = await sendJson(base, PATH, { headers: { authorization: `Bearer ${token}` } });
			assert.equal(response.status, 200);
			assert.equal(response.body.ok, true);
			const tokens = response.body.pages.map((page) => page.token);
			assert.equal(tokens.length, 3);
			assert.ok(!tokens.includes(TOKEN_OTHER), 'the row of the other user is absent');
		});
		assert.equal(store.rows('osionos_published_pages').length, 4, 'the row of the other user is untouched');
	});

	it('answers 429 with the retry window on the 61st call of the minute', async (t) => {
		const { base, config } = await publishedWorld(t);
		const token = appToken(config, USER_A);
		await withPublishFlag('1', async () => {
			for (let call = 1; call <= 60; call += 1) {
				const response = await sendJson(base, PATH, { headers: { authorization: `Bearer ${token}` } });
				assert.equal(response.status, 200, `call ${call} is inside the window`);
			}
			const refused = await sendJson(base, PATH, { headers: { authorization: `Bearer ${token}` } });
			assert.equal(refused.status, 429);
			assert.equal(refused.body.code, 'rate_limited');
			assert.equal(refused.body.retryAfterSeconds, 60);
		});
	});

	it('answers the six keys of the contract and nothing else', async (t) => {
		const { base, store, config } = await publishedWorld(t);
		const token = appToken(config, USER_A);
		await withPublishFlag('1', async () => {
			const response = await sendJson(base, PATH, { headers: { authorization: `Bearer ${token}` } });
			assert.equal(response.status, 200);
			assert.ok(response.body.pages.length > 0);
			for (const page of response.body.pages) {
				assert.deepEqual(Object.keys(page).sort(), ['icon', 'pageId', 'publishedAt', 'status', 'title', 'token']);
				assert.equal(page.content, undefined, 'the snapshot body never reaches the account plane');
				assert.equal(page.email, undefined);
				assert.equal(page.owner_id, undefined);
			}
		});
		// The columns that are read are the columns that are answered: a wider select would
		// pull the snapshot body into the account plane.
		assert.equal(store.callsTo('osionos_published_pages').at(-1).params.get('select'), 'token,page_id,title,icon,published_at');
		assert.equal(store.callsTo('osionos_pages').at(-1).params.get('select'), 'id,title,icon,updated_at');
	});

	it('calls a copy live while the page is older than the snapshot, and out of date after', async (t) => {
		const { base, config } = await publishedWorld(t);
		const token = appToken(config, USER_A);
		await withPublishFlag('1', async () => {
			const response = await sendJson(base, PATH, { headers: { authorization: `Bearer ${token}` } });
			assert.equal(response.status, 200);
			const byToken = Object.fromEntries(response.body.pages.map((page) => [page.token, page]));
			assert.equal(byToken[TOKEN_LIVE].status, 'live');
			assert.equal(byToken[TOKEN_OUTDATED].status, 'outdated');
			assert.equal(byToken[TOKEN_GONE].status, 'outdated', 'a page that is gone is out of date');
		});
	});

	it('shows the current title of the page, and the snapshot title when the page is gone', async (t) => {
		const { base, config } = await publishedWorld(t);
		const token = appToken(config, USER_A);
		await withPublishFlag('1', async () => {
			const response = await sendJson(base, PATH, { headers: { authorization: `Bearer ${token}` } });
			const byToken = Object.fromEntries(response.body.pages.map((page) => [page.token, page]));
			assert.equal(byToken[TOKEN_LIVE].title, 'The live page now');
			assert.equal(byToken[TOKEN_LIVE].icon, '📘');
			assert.equal(byToken[TOKEN_GONE].title, 'Snapshot of a deleted page');
			assert.equal(byToken[TOKEN_GONE].icon, null);
		});
	});

	it('reads the snapshots with the account token and the pages with the service key', async (t) => {
		const { base, store, config } = await publishedWorld(t);
		const token = appToken(config, USER_A);
		await withPublishFlag('1', async () => {
			await sendJson(base, PATH, { headers: { authorization: `Bearer ${token}` } });
		});
		const snapshots = store.callsTo('osionos_published_pages').at(-1);
		assert.equal(snapshots.claims?.aud, 'osionos-account');
		assert.equal(snapshots.claims?.role, 'osionos_account_user');
		assert.equal(snapshots.claims?.sub, USER_A);
		const pages = store.callsTo('osionos_pages').at(-1);
		assert.equal(pages.claims, null, 'the pages are read with the service key');
		assert.match(pages.authorization, /^Bearer service-role-test-key$/);
		assert.doesNotMatch(snapshots.authorization, /service-role-test-key/, 'the service key never reaches the snapshot read');
	});

	it('answers 503 when the account role is missing, never an empty list', async (t) => {
		const { base, config } = await publishedWorld(t, {
			fail: (call) => (call.table === 'osionos_published_pages' ? { status: 500, body: { code: '22023' } } : null),
		});
		const token = appToken(config, USER_A);
		await withPublishFlag('1', async () => {
			const response = await sendJson(base, PATH, { headers: { authorization: `Bearer ${token}` } });
			assert.equal(response.status, 503);
			assert.equal(response.body.code, 'account_plane_unavailable');
			assert.equal(response.body.pages, undefined, 'an empty list would hide the outage');
			assert.equal(response.body.ok, false);
		});
	});

	it('answers 503 when the account role may not read the table', async (t) => {
		const { base, config } = await publishedWorld(t, {
			fail: (call) => (call.table === 'osionos_published_pages' ? { status: 403, body: { code: '42501' } } : null),
		});
		const token = appToken(config, USER_A);
		await withPublishFlag('1', async () => {
			const response = await sendJson(base, PATH, { headers: { authorization: `Bearer ${token}` } });
			assert.equal(response.status, 503);
			assert.equal(response.body.code, 'account_plane_unavailable');
			assert.equal(response.body.pages, undefined);
		});
	});

	it('caps the list at 50 rows, so the id list of the pages read stays under its ceiling', async (t) => {
		const many = Array.from({ length: 120 }, (_, index) => ({
			token: String(index).padStart(32, '0'),
			page_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
			title: `Snapshot ${index}`,
			icon: null,
			published_at: '2026-10-01T10:00:00.000Z',
			owner_id: USER_A,
		}));
		const { base, store, config } = await publishedWorld(t, { published: many });
		const token = appToken(config, USER_A);
		await withPublishFlag('1', async () => {
			const response = await sendJson(base, PATH, { headers: { authorization: `Bearer ${token}` } });
			assert.equal(response.status, 200);
			assert.equal(response.body.pages.length, 50);
		});
		const pages = store.callsTo('osionos_pages').at(-1);
		const ids = String(pages.params.get('id'));
		assert.ok(ids.startsWith('in.('), 'the pages are read by their ids');
		assert.ok(ids.slice(4, -1).split(',').length <= IN_LIST_CEILING, 'the id list stays under the ceiling');
	});

	it('is mounted on the account seam, beside the session routes', async (t) => {
		const { base, config } = await publishedWorld(t);
		const token = appToken(config, USER_A);
		await withPublishFlag('1', async () => {
			const listed = await sendJson(base, PATH, { headers: { authorization: `Bearer ${token}` } });
			assert.equal(listed.status, 200);
			assert.ok(Array.isArray(listed.body.pages), 'this module answers the path');
			const sessions = await sendJson(base, '/api/account/sessions', { headers: { authorization: `Bearer ${token}` } });
			assert.equal(sessions.status, 200, 'the other module of the seam still answers its own path');
			assert.ok(Array.isArray(sessions.body.sessions));
		});
	});
});
