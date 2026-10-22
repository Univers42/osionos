/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-self-data.test.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The self sources: the caller's own rows, as a read-only database.
 *
 * What is proved here: the six sources answer with their own allowlist, the answer never
 * carries a column the allowlist does not name, the scope of a service-role read is in the
 * PATH (a forged query parameter changes nothing), the two account-plane sources are read
 * with the caller's own JWT and never with the service key, the peer of a connection is
 * reduced to its public card, the cap says it truncated, a store failure is a 503 and
 * never an empty list, and the route answers 405 / 404 / 401 / 429 where it should.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { accountConfig, send, sessionToken, startAccountWorld, startBridgeWorld, USER_A, USER_B } from './support/account-world.mjs';
import { kvStub } from './support/kv-stub.mjs';
import { SELF_SOURCES, selfSourceById, dedupeEdgesByPeer } from '../../scripts/bridge-self-sources.mjs';

const WORKSPACE = 'cccccccc-3333-4333-8333-cccccccccccc';
const PAGE_A = '11111111-1111-4111-8111-111111111111';
const PAGE_B = '22222222-2222-4222-8222-222222222222';
const PAGE_UNOWNED = '33333333-3333-4333-8333-333333333333';
const PAGE_EDITABLE = '44444444-4444-4444-8444-444444444444';
const PEER_PLAIN = '55555555-5555-4555-8555-555555555555';
const PEER_QUIET = '66666666-6666-4666-8666-666666666666';
const PEER_BLOCKER = '77777777-7777-4777-8777-777777777777';
const WORKSPACE_ONE = '88888888-8888-4888-8888-888888888888';
const WORKSPACE_TWO = '99999999-9999-4999-8999-999999999999';
const WORKSPACE_OTHER = '12121212-1212-4212-8212-121212121212';
const SESSION_REVOKED = '13131313-1313-4313-8313-131313131313';
const SESSION_EXPIRED = '14141414-1414-4414-8414-141414141414';
const SESSION_B = '15151515-1515-4515-8515-151515151515';

const FUTURE = new Date(Date.now() + 3_600_000).toISOString();
const PAST = '2020-01-01T00:00:00.000Z';

/** The jti of an app session token: the id of the session row the caller is holding. */
function jtiOf(token) {
	const payload = token.split('.')[1];
	return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).jti;
}

/** The rows of the world: two users, their pages, tasks, publications, edges and rooms. */
function seed(jti) {
	return {
		pages: [
			{
				id: PAGE_A, workspace_id: WORKSPACE, owner_id: USER_A, title: 'A page', icon: '📘', cover: null,
				surface: 'page', visibility: 'private', database_id: null, parent_page_id: null,
				created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-20T00:00:00.000Z', archived_at: null,
				collaborators: [USER_B], properties: [{ id: 'p1' }], content: [{ type: 'paragraph', text: 'the body' }],
				email: 'a@example.com',
			},
			{
				id: PAGE_B, workspace_id: WORKSPACE, owner_id: USER_B, title: 'B page', icon: null, cover: null,
				surface: 'page', visibility: 'private', database_id: null, parent_page_id: null,
				created_at: '2026-10-02T00:00:00.000Z', updated_at: '2026-10-21T00:00:00.000Z', archived_at: null,
				email: 'b@example.com',
			},
			{
				id: PAGE_UNOWNED, workspace_id: WORKSPACE, owner_id: null, title: 'Nobody page', icon: null, cover: null,
				surface: 'page', visibility: 'private', database_id: null, parent_page_id: null,
				created_at: '2026-10-03T00:00:00.000Z', updated_at: '2026-10-22T00:00:00.000Z', archived_at: null,
			},
			{
				id: PAGE_EDITABLE, workspace_id: WORKSPACE, owner_id: USER_B, title: 'B page A may edit', icon: null, cover: null,
				surface: 'page', visibility: 'shared', database_id: null, parent_page_id: null,
				created_at: '2026-10-04T00:00:00.000Z', updated_at: '2026-10-23T00:00:00.000Z', archived_at: null,
				collaborators: [USER_A], email: 'b@example.com',
			},
		],
		tasks: [
			{ page_id: PAGE_A, block_id: 'b1', workspace_id: WORKSPACE, owner_id: USER_A, content: 'Buy milk', checked: false, due_at: null, updated_at: '2026-10-20T00:00:00.000Z' },
			{ page_id: PAGE_B, block_id: 'b2', workspace_id: WORKSPACE, owner_id: USER_B, content: 'B task', checked: true, due_at: null, updated_at: '2026-10-21T00:00:00.000Z', email: 'b@example.com' },
		],
		published: [
			{ token: 'aaaa1111', page_id: PAGE_A, owner_id: USER_A, title: 'A published', icon: '📄', published_at: '2026-10-01T00:00:00.000Z', content: [{ type: 'paragraph', text: 'the body' }], email: 'a@example.com' },
			{ token: 'bbbb2222', page_id: PAGE_B, owner_id: USER_B, title: 'B published', icon: null, published_at: '2026-10-02T00:00:00.000Z', content: [] },
		],
		connections: [
			{ id: 'c1', requester_id: USER_A, addressee_id: PEER_PLAIN, status: 'accepted', source: 'manual', created_at: '2026-10-02T00:00:00.000Z', responded_at: '2026-10-03T00:00:00.000Z', intro_message: 'a private word', email: 'peer@example.com' },
			{ id: 'c2', requester_id: PEER_QUIET, addressee_id: USER_A, status: 'accepted', source: 'manual', created_at: '2026-10-04T00:00:00.000Z', responded_at: null },
			{ id: 'c3', requester_id: USER_A, addressee_id: PEER_BLOCKER, status: 'pending', source: 'manual', created_at: '2026-10-05T00:00:00.000Z', responded_at: null },
			{ id: 'c4', requester_id: USER_B, addressee_id: PEER_PLAIN, status: 'accepted', source: 'manual', created_at: '2026-10-06T00:00:00.000Z', responded_at: null },
		],
		workspaces: [
			{ id: WORKSPACE_ONE, owner_id: USER_A, name: 'One', slug: 'one', source: 'bridge', settings: { secret: true }, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-20T00:00:00.000Z' },
			{ id: WORKSPACE_TWO, owner_id: USER_B, name: 'Two', slug: 'two', source: 'bridge', settings: { secret: true }, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-21T00:00:00.000Z' },
			{ id: WORKSPACE_OTHER, owner_id: USER_B, name: 'Other', slug: 'other', source: 'bridge', settings: { secret: true }, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-22T00:00:00.000Z' },
		],
		members: [
			{ workspace_id: WORKSPACE_ONE, user_id: USER_A, role: 'owner', permissions: ['create', 'read', 'update'], created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-20T00:00:00.000Z' },
			{ workspace_id: WORKSPACE_TWO, user_id: USER_A, role: 'editor', permissions: ['read', 'update'], created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-21T00:00:00.000Z' },
			{ workspace_id: WORKSPACE_OTHER, user_id: USER_B, role: 'viewer', permissions: ['read'], created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-22T00:00:00.000Z' },
		],
		sessions: [
			{ id: jti, user_id: USER_A, created_at: '2026-10-20T10:00:00.000Z', expires_at: FUTURE, last_seen_at: '2026-10-20T10:05:00.000Z', auth_method: 'password', ip_prefix: '10.0.0.0/24', user_agent: 'Test agent', ip_hash: 'a'.repeat(64), refresh_hash: 'b'.repeat(64), revoked_at: null, revoked_reason: null },
			{ id: SESSION_REVOKED, user_id: USER_A, created_at: '2026-10-19T10:00:00.000Z', expires_at: FUTURE, last_seen_at: '2026-10-19T10:05:00.000Z', auth_method: 'password', ip_prefix: null, user_agent: null, ip_hash: null, refresh_hash: null, revoked_at: '2026-10-20T00:00:00.000Z', revoked_reason: 'user' },
			{ id: SESSION_EXPIRED, user_id: USER_A, created_at: '2026-10-01T10:00:00.000Z', expires_at: PAST, last_seen_at: '2026-10-01T10:05:00.000Z', auth_method: 'oauth', ip_prefix: null, user_agent: null, ip_hash: null, refresh_hash: null, revoked_at: null, revoked_reason: null },
			{ id: SESSION_B, user_id: USER_B, created_at: '2026-10-20T11:00:00.000Z', expires_at: FUTURE, last_seen_at: '2026-10-20T11:05:00.000Z', auth_method: 'password', ip_prefix: null, user_agent: null, ip_hash: null, refresh_hash: null, revoked_at: null, revoked_reason: null },
		],
		directory: [
			{ user_id: PEER_PLAIN, display_name: 'Plain Peer', username: 'plain', profile: { avatar: 'https://cdn.example.com/plain.png', headline: 'Builds things' }, last_seen_at: '2026-10-20T00:00:00.000Z', directory_opt_out: false, headline: 'Builds things', search_doc: "'builds':1" },
			{ user_id: PEER_QUIET, display_name: 'Quiet Peer', username: 'quiet', profile: { avatar: null, headline: '' }, last_seen_at: null, directory_opt_out: true, headline: '', search_doc: '' },
			{ user_id: PEER_BLOCKER, display_name: 'Blocking Peer', username: 'blocking', profile: { avatar: 'https://cdn.example.com/blocking.png', headline: 'Blocked' }, last_seen_at: null, directory_opt_out: false, headline: 'Blocked', search_doc: "'blocked':1" },
		],
		blocks: [
			{ blocker_id: PEER_BLOCKER, blocked_id: USER_A, reason: null, created_at: '2026-10-01T00:00:00.000Z' },
		],
	};
}

/** The world: the caller, their rows and the store behind the bridge. */
async function world(t, { rows = {}, fail = null, kv } = {}) {
	const config = accountConfig();
	const token = sessionToken(config, USER_A);
	const built = await startAccountWorld(t, { config, rows: { ...seed(jtiOf(token)), ...rows }, fail, kv });
	return { ...built, token, tokenB: sessionToken(built.config, USER_B) };
}

const read = (base, source, options = {}) => send(base, `/api/account/self-data/${source}`, options);

describe('GET /api/account/self-data/<source>', () => {
	it('answers the six sources with their own name, their allowlist and their rows', async (t) => {
		const { base, token } = await world(t);
		for (const source of SELF_SOURCES) {
			const response = await read(base, source.id, { token });
			assert.equal(response.status, 200, `${source.id} answers`);
			assert.equal(response.body.ok, true);
			assert.equal(response.body.source, source.id);
			assert.deepEqual(response.body.columns, [...source.columns, ...Object.keys(source.computed ?? {})]);
			assert.ok(Array.isArray(response.body.rows), `${source.id} answers rows`);
			assert.equal(typeof response.body.truncated, 'boolean');
		}
	});

	it('carries the allowlisted keys of every row, and nothing else', async (t) => {
		const { base, token } = await world(t);
		for (const source of SELF_SOURCES) {
			const response = await read(base, source.id, { token });
			for (const row of response.body.rows) {
				assert.deepEqual(Object.keys(row).sort(), [...response.body.columns].sort(), `${source.id} answers its allowlist`);
			}
		}
		const pages = await read(base, 'my-pages', { token });
		assert.equal(pages.body.rows[0].email, undefined, 'the extra column of the fake never reaches the answer');
		assert.equal(pages.body.rows[0].content, undefined, 'the body of the page never reaches the answer');
		assert.equal(pages.body.rows[0].collaborators, undefined);
		const sessions = await read(base, 'my-sessions', { token });
		assert.equal(sessions.body.rows[0].ip_hash, undefined, 'the keyed hash never reaches the answer');
		assert.equal(sessions.body.rows[0].refresh_hash, undefined);
		assert.equal(sessions.body.rows[0].ip_prefix, undefined, 'a dashboard block has no need of a device fingerprint');
	});

	it('names the columns it reads, and never reads them all', async (t) => {
		const { base, store, token } = await world(t);
		await read(base, 'my-pages', { token });
		const call = store.callsTo('osionos_pages').at(-1);
		assert.equal(call.params.get('select'), selfSourceById('my-pages').columns.join(','));
		assert.notEqual(call.params.get('select'), '*');
		assert.equal(call.params.get('limit'), '201', 'the read asks for one row more than the cap');
	});

	it('scopes the service-role reads in the path, not in JavaScript', async (t) => {
		const { base, store, token } = await world(t);
		await read(base, 'my-pages', { token });
		await read(base, 'my-tasks', { token });
		await read(base, 'my-connections', { token });
		await read(base, 'my-workspaces', { token });
		assert.equal(store.callsTo('osionos_pages').at(-1).params.get('owner_id'), `eq.${USER_A}`);
		assert.equal(store.callsTo('osionos_tasks').at(-1).params.get('owner_id'), `eq.${USER_A}`);
		assert.equal(
			store.callsTo('osionos_connections').at(-1).params.get('or'),
			`(requester_id.eq.${USER_A},addressee_id.eq.${USER_A})`,
		);
		assert.equal(store.callsTo('osionos_workspace_members').at(-1).params.get('user_id'), `eq.${USER_A}`);
	});

	it('answers the rows of the caller and nobody else\'s', async (t) => {
		const { base, token } = await world(t);
		const pages = await read(base, 'my-pages', { token });
		const ids = pages.body.rows.map((row) => row.id);
		assert.deepEqual(ids, [PAGE_A], 'the page of the other user, the unowned one and the editable one are absent');
		const tasks = await read(base, 'my-tasks', { token });
		assert.deepEqual(tasks.body.rows.map((row) => row.block_id), ['b1']);
		const published = await read(base, 'my-published', { token });
		assert.deepEqual(published.body.rows.map((row) => row.token), ['aaaa1111']);
	});

	it('changes nothing when the query asks for another user', async (t) => {
		const { base, token } = await world(t);
		const plain = await read(base, 'my-pages', { token });
		const forged = await read(base, `my-pages?user_id=${USER_B}`, { token });
		assert.equal(forged.status, 200);
		assert.deepEqual(forged.body.rows, plain.body.rows, 'the route reads no query parameter');
	});

	it('reads the two account-plane sources with the caller\'s own token', async (t) => {
		const { base, store, token } = await world(t);
		await read(base, 'my-sessions', { token });
		await read(base, 'my-published', { token });
		const sessions = store.callsTo('osionos_sessions').at(-1);
		assert.equal(sessions.claims?.role, 'osionos_account_user');
		assert.equal(sessions.claims?.sub, USER_A);
		assert.doesNotMatch(sessions.authorization, /service-role-test-key/, 'the service key never reaches the account read');
		const published = store.callsTo('osionos_published_pages').at(-1);
		assert.equal(published.claims?.role, 'osionos_account_user');
		assert.equal(published.claims?.sub, USER_A);
		assert.doesNotMatch(published.authorization, /service-role-test-key/);
	});

	it('reads the four legacy sources with the service key', async (t) => {
		const { base, store, token } = await world(t);
		await read(base, 'my-pages', { token });
		await read(base, 'my-tasks', { token });
		await read(base, 'my-connections', { token });
		await read(base, 'my-workspaces', { token });
		for (const table of ['osionos_pages', 'osionos_tasks', 'osionos_connections', 'osionos_workspace_members']) {
			const call = store.callsTo(table).at(-1);
			assert.equal(call.claims, null, `${table} is read with the service key`);
			assert.match(call.authorization, /^Bearer service-role-test-key$/);
		}
	});

	it('answers the live sessions of the caller, and marks the one it holds', async (t) => {
		const { base, token } = await world(t);
		const response = await read(base, 'my-sessions', { token });
		const ids = response.body.rows.map((row) => row.id);
		assert.equal(ids.length, 1, 'the revoked and the expired row are absent');
		assert.equal(ids.includes(SESSION_REVOKED), false);
		assert.equal(ids.includes(SESSION_EXPIRED), false);
		assert.equal(ids.includes(SESSION_B), false, 'the session of the other user is absent');
		assert.equal(response.body.rows[0].current, true, 'the session the caller holds is the current one');
		assert.match(response.body.rows[0].label, /^Password · \d{2} [A-Z][a-z]{2}, \d{2}:\d{2}$/, 'the row has a readable title');
	});

	it('reduces a peer whose block row differs only in case', async (t) => {
		const { base, token } = await world(t, {
			rows: {
				blocks: [{ blocker_id: PEER_BLOCKER, blocked_id: USER_A.toUpperCase(), reason: null, created_at: '2026-10-01T00:00:00.000Z' }],
			},
		});
		const response = await read(base, 'my-connections', { token });
		const row = response.body.rows.find((item) => item.peer.userId === PEER_BLOCKER.toLowerCase());
		assert.ok(row, 'the blocker peer is still listed');
		assert.deepEqual(Object.keys(row.peer).sort(), ['avatar', 'name', 'userId'], 'case difference still reduces the card');
	});

	it('reduces the peer of a connection to its public card', async (t) => {
		const { base, token } = await world(t);
		const response = await read(base, 'my-connections', { token });
		const byPeer = new Map(response.body.rows.map((row) => [row.peer.userId, row]));
		assert.equal(byPeer.size, 3, 'the edge of the other user is absent');
		assert.deepEqual(
			Object.keys(byPeer.get(PEER_PLAIN).peer).sort(),
			['avatar', 'headline', 'lastSeenAt', 'name', 'userId', 'username'].sort(),
			'a peer in the directory gets the full card',
		);
		assert.deepEqual(Object.keys(byPeer.get(PEER_QUIET).peer).sort(), ['avatar', 'name', 'userId'], 'a peer who left the directory is reduced');
		assert.deepEqual(Object.keys(byPeer.get(PEER_BLOCKER).peer).sort(), ['avatar', 'name', 'userId'], 'a peer who blocked the caller is reduced');
		assert.equal(byPeer.get(PEER_PLAIN).peer.username, 'plain');
		assert.equal(byPeer.get(PEER_QUIET).peer.username, undefined, 'the reduced card holds no username');
		assert.equal(JSON.stringify(response.body).includes('intro_message'), false, 'the message of the edge never reaches the answer');
		assert.equal(JSON.stringify(response.body).includes('peer@example.com'), false, 'no address of the peer reaches the answer');
		assert.equal(byPeer.get(PEER_PLAIN).direction, 'outgoing', 'the caller sent the request');
		assert.equal(byPeer.get(PEER_QUIET).direction, 'incoming', 'the peer sent the request');
	});

	it('answers the workspaces of the caller once each, with their own role', async (t) => {
		const { base, store, token } = await world(t);
		const response = await read(base, 'my-workspaces', { token });
		const rows = response.body.rows;
		assert.equal(rows.length, 2, 'the workspace of the other user is absent');
		const one = rows.find((row) => row.workspace_id === WORKSPACE_ONE);
		const two = rows.find((row) => row.workspace_id === WORKSPACE_TWO);
		assert.equal(one.role, 'owner');
		assert.deepEqual(one.permissions, ['create', 'read', 'update']);
		assert.equal(one.name, 'One');
		assert.equal(one.slug, 'one');
		assert.equal(two.role, 'editor');
		assert.equal(one.settings, undefined, 'the settings of the workspace never reach the answer');
		assert.equal(JSON.stringify(response.body).includes('secret'), false);
		assert.equal(store.callsTo('osionos_workspace_members').length >= 1, true);
	});

	it('collapses bidirectional edges into one row per person', () => {
		const userId = USER_A;
		const rows = [
			{ id: 'e1', requester_id: USER_A, addressee_id: PEER_PLAIN, status: 'pending', created_at: '2026-10-01T00:00:00.000Z' },
			{ id: 'e2', requester_id: PEER_PLAIN, addressee_id: USER_A, status: 'accepted', created_at: '2026-10-02T00:00:00.000Z' },
		];
		const deduped = dedupeEdgesByPeer(rows, userId);
		assert.equal(deduped.length, 1, 'one row per person, not per edge');
		assert.equal(deduped[0].id, 'e2', 'the most recent edge wins');
		assert.equal(deduped[0].status, 'accepted');
	});

	it('answers one row per person for my-connections', async (t) => {
		const { base, token } = await world(t, {
			rows: {
				connections: [
					{ id: 'd1', requester_id: USER_A, addressee_id: PEER_PLAIN, status: 'pending', source: 'manual', created_at: '2026-10-01T00:00:00.000Z', responded_at: null },
					{ id: 'd2', requester_id: PEER_PLAIN, addressee_id: USER_A, status: 'accepted', source: 'manual', created_at: '2026-10-02T00:00:00.000Z', responded_at: '2026-10-03T00:00:00.000Z' },
					{ id: 'c2', requester_id: PEER_QUIET, addressee_id: USER_A, status: 'accepted', source: 'manual', created_at: '2026-10-04T00:00:00.000Z', responded_at: null },
					{ id: 'c3', requester_id: USER_A, addressee_id: PEER_BLOCKER, status: 'pending', source: 'manual', created_at: '2026-10-05T00:00:00.000Z', responded_at: null },
				],
			},
		});
		const response = await read(base, 'my-connections', { token });
		const peers = response.body.rows.map((row) => row.peer.userId);
		assert.equal(new Set(peers).size, peers.length, 'no person appears twice');
		assert.equal(response.body.rows.length, 3, 'three people, not four edges');
	});

	it('caps the answer at 200 rows and says it was truncated', async (t) => {
		const many = Array.from({ length: 250 }, (_, index) => ({
			id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
			workspace_id: WORKSPACE, owner_id: USER_A, title: `Page ${index}`, icon: null, cover: null,
			surface: 'page', visibility: 'private', database_id: null, parent_page_id: null,
			created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-20T00:00:00.000Z', archived_at: null,
		}));
		const { base, token } = await world(t, { rows: { pages: many } });
		const response = await read(base, 'my-pages', { token });
		assert.equal(response.body.rows.length, 200);
		assert.equal(response.body.truncated, true);
	});

	it('says it was not truncated when the rows fit', async (t) => {
		const { base, token } = await world(t);
		const response = await read(base, 'my-pages', { token });
		assert.equal(response.body.rows.length, 1);
		assert.equal(response.body.truncated, false);
	});

	it('answers 503 when the store fails, never an empty list', async (t) => {
		const { base, token } = await world(t, {
			fail: (call) => (call.table === 'osionos_pages' ? { status: 500, body: { code: '57014' } } : null),
		});
		const response = await read(base, 'my-pages', { token });
		assert.equal(response.status, 503);
		assert.equal(response.body.code, 'self_data_unavailable');
		assert.equal(response.body.rows, undefined, 'an empty list would hide the outage');
	});

	it('answers 503 when the table is missing, never an empty list', async (t) => {
		const { base, token } = await world(t, {
			fail: (call) => (call.table === 'osionos_pages' ? { status: 404, body: { code: 'PGRST205', message: 'Could not find the table' } } : null),
		});
		const response = await read(base, 'my-pages', { token });
		assert.equal(response.status, 503);
		assert.equal(response.body.code, 'self_data_unavailable');
		assert.equal(response.body.rows, undefined);
	});

	it('answers 503 when the store answers a non-array, never 200 { rows: [] }', async (t) => {
		const { base, token } = await world(t, {
			fail: (call) => (call.table === 'osionos_pages' ? { status: 200, body: {} } : null),
		});
		const response = await read(base, 'my-pages', { token });
		assert.equal(response.status, 503);
		assert.equal(response.body.code, 'self_data_unavailable');
		assert.equal(response.body.rows, undefined);
	});

	it('answers 401 without a session', async (t) => {
		const { base, store } = await world(t);
		const response = await read(base, 'my-pages');
		assert.equal(response.status, 401);
		assert.equal(store.callsTo('osionos_pages').length, 0, 'no row is read without a session');
	});

	it('answers 405 for a method that is not a read', async (t) => {
		const { base, store } = await world(t);
		for (const method of ['POST', 'PATCH', 'DELETE']) {
			const response = await send(base, '/api/account/self-data/my-pages', { method, token: 'x' });
			assert.equal(response.status, 405, `${method} is refused`);
			assert.equal(response.body.code, 'method_not_allowed');
		}
		assert.equal(store.callsTo('osionos_pages').length, 0, 'no row is read by a write');
	});

	it('answers 404 for a source that does not exist', async (t) => {
		const { base, store, token } = await world(t);
		const response = await read(base, 'my-activity', { token });
		assert.equal(response.status, 404);
		assert.equal(response.body.code, 'unknown_self_source');
		assert.equal(store.calls.length, 0, 'no table is read for an unknown source');
	});

	it('answers 401, not 404, for an unknown source without a session', async (t) => {
		const { base, store } = await world(t);
		const response = await read(base, 'my-activity');
		assert.equal(response.status, 401, 'an anonymous caller cannot probe which sources exist');
		assert.equal(store.calls.length, 0, 'no table is read without a session');
	});

	it('does not claim a path with two segments', async (t) => {
		const { base, store } = await world(t);
		const response = await read(base, 'views/my-pages', { token: 'x' });
		assert.equal(response.status, 404, 'the path belongs to another route');
		assert.equal(store.calls.length, 0, 'no table is read for another route');
	});

	it('answers 429 on the 121st call of the minute', async (t) => {
		const { base, token } = await world(t, { kv: kvStub() });
		for (let call = 1; call <= 120; call += 1) {
			const response = await read(base, 'my-pages', { token });
			assert.equal(response.status, 200, `call ${call} is inside the window`);
		}
		const refused = await read(base, 'my-pages', { token });
		assert.equal(refused.status, 429);
		assert.equal(refused.body.code, 'rate_limited');
		assert.equal(refused.body.retryAfterSeconds, 60);
	});

	it('is mounted on the account seam, beside the other account routes', async (t) => {
		const config = accountConfig();
		const token = sessionToken(config, USER_A);
		const built = await startBridgeWorld(t, { config, rows: seed(jtiOf(token)) });
		const response = await read(built.base, 'my-pages', { token });
		assert.equal(response.status, 200);
		assert.equal(response.body.source, 'my-pages');
		const preferences = await send(built.base, '/api/preferences', { token });
		assert.equal(preferences.status, 200, 'the other module of the seam still answers its own path');
	});
});
