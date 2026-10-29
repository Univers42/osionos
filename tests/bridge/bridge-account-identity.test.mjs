/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-identity.test.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The two writes behind the step-up proof: the username change and the deletion
 * request, and the legacy route that used to change a name without any proof.
 *
 * The grant is written into the shared store directly here (the step-up itself is
 * bridge-account-sudo.test.mjs), so these tests are about what the proof BUYS: the
 * write path, the limits, the answers and the audit rows.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTtlKv } from './support/account-kv.mjs';
import { startIdentityWorld } from './support/account-erasure-world.mjs';
import { send, sessionToken, startAccountWorld, startBridgeWorld, sudoToken, USER_A, USER_B } from './support/account-world.mjs';

const WORKSPACE = '0a4d1c2e-0000-4000-8000-000000000ad1';
const SUCCESSOR = 'cccccccc-3333-4333-8333-cccccccccccc';
const GRACE_MS = 14 * 24 * 60 * 60 * 1000;

function profileOf(userId, overrides = {}) {
	return {
		user_id: userId, display_name: 'Ada Lovelace', username: 'ada', version: 1,
		created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z', ...overrides,
	};
}

/** A world whose caller already holds a sudo grant. */
async function world(t, { kv, rows = {}, fail = null, sudo = true } = {}) {
	const clock = { at: Date.now() };
	const store = kv ?? createTtlKv({ now: () => clock.at });
	const built = await startAccountWorld(t, {
		rows: {
			profiles: [profileOf(USER_A)],
			workspaces: [{ id: WORKSPACE, owner_id: USER_A, name: 'Home' }],
			members: [{ workspace_id: WORKSPACE, user_id: SUCCESSOR, role: 'member' }],
			...rows,
		},
		fail,
		kv: store,
		now: () => clock.at,
	});
	const token = sudo ? await sudoToken(built.config, store, USER_A) : sessionToken(built.config, USER_A);
	return { ...built, token, clock, kv: store };
}

const changeName = (base, token, username) => send(base, '/api/account/username', { method: 'POST', token, body: { username } });

describe('POST /api/account/username', () => {
	it('refuses without a step-up proof', async (t) => {
		const { base, token } = await world(t, { sudo: false });
		const response = await changeName(base, token, 'ada2');
		assert.equal(response.status, 403);
		assert.equal(response.body.code, 'sudo_required');
	});

	it('writes through the atomic function and answers the name', async (t) => {
		const { base, token, store } = await world(t);
		const response = await changeName(base, token, 'ada2');
		assert.equal(response.status, 200);
		assert.deepEqual(response.body, { username: 'ada2' });
		const profile = store.rows('osionos_profiles')[0];
		assert.equal(profile.username, 'ada2');
		assert.equal(profile.version, 2);
	});

	it('calls the function as the user, with the account token', async (t) => {
		const { base, token, store } = await world(t);
		await changeName(base, token, 'ada2');
		const call = store.callsTo('rpc/osionos_account_change_username')[0];
		assert.ok(call, 'the write goes through the function');
		assert.equal(call.method, 'POST');
		assert.equal(call.body.p_username, 'ada2');
		assert.equal(call.claims?.aud, 'osionos-account');
		assert.equal(call.claims?.role, 'osionos_account_user');
		assert.equal(call.claims?.sub, USER_A);
	});

	it('answers the same 409 for a name that is taken and one that is held', async (t) => {
		const taken = await world(t, { rows: { profiles: [profileOf(USER_A), profileOf(USER_B, { username: 'taken' })] } });
		const held = await world(t, {
			rows: {
				profiles: [profileOf(USER_A)],
				history: [{ id: 'dddddddd-4444-4444-8444-dddddddddddd', user_id: USER_B, username: 'held', changed_at: '2026-10-01T00:00:00.000Z', released_at: '2027-01-01T00:00:00.000Z' }],
			},
		});
		const first = await changeName(taken.base, taken.token, 'taken');
		const second = await changeName(held.base, held.token, 'held');
		assert.equal(first.status, 409);
		assert.equal(second.status, 409);
		assert.equal(first.body.code, 'username_unavailable');
		assert.equal(second.body.code, 'username_unavailable');
		assert.equal(first.text, second.text, 'the answer must not tell a taken name from a held one');
	});

	it('answers 422 invalid_username for a name the database refuses', async (t) => {
		const { base, token } = await world(t);
		for (const username of ['ab', '-name', 'admin']) {
			const response = await changeName(base, token, username);
			assert.equal(response.status, 422, `name ${username} answers ${response.status}`);
			assert.equal(response.body.code, 'invalid_username');
		}
	});

	it('does not trim the requested name', async (t) => {
		const { base, token } = await world(t);
		const response = await changeName(base, token, ' ada2 ');
		assert.equal(response.status, 422);
		assert.equal(response.body.code, 'invalid_username');
	});

	it('answers 429 on the fourth change of the day', async (t) => {
		const { base, token } = await world(t);
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const written = await changeName(base, token, `ada${attempt}`);
			assert.equal(written.status, 200, `change ${attempt + 1} answers ${written.status}`);
		}
		const limited = await changeName(base, token, 'ada9');
		assert.equal(limited.status, 429);
		assert.equal(limited.body.code, 'rate_limited');
	});

	it('answers 503 and writes nothing when the audit storage is down', async (t) => {
		const { base, token, store } = await world(t, {
			fail: (call) => (call.table === 'osionos_bridge_audit_events' ? { status: 500, body: { message: 'down' } } : null),
		});
		const response = await changeName(base, token, 'ada2');
		assert.equal(response.status, 503);
		assert.equal(response.body.code, 'audit_unavailable');
		assert.equal(store.callsTo('rpc/osionos_account_change_username').length, 0);
		assert.equal(store.rows('osionos_profiles')[0].username, 'ada');
	});
});

describe('the legacy profile route', () => {
	it('refuses a username and writes nothing of the body', async (t) => {
		const { base, config, store } = await startBridgeWorld(t, {
			rows: {
				identities: [{
					user_id: USER_A, display_name: 'Ada Lovelace', username: 'ada', profile: { bio: 'Old bio' },
					created_at: '2026-10-01T00:00:00.000Z', last_seen_at: null, directory_opt_out: false,
				}],
			},
		});
		const response = await send(base, '/api/profile/me', {
			method: 'PATCH', token: sessionToken(config, USER_A), body: { username: 'ada2', bio: 'New bio' },
		});
		assert.equal(response.status, 422);
		assert.equal(response.body.code, 'username_moved');
		assert.match(response.body.message, /POST \/api\/account\/username/);
		const writes = store.callsTo('osionos_bridge_identities').filter((call) => call.method === 'PATCH');
		assert.equal(writes.length, 0, 'no field of the body is applied');
		assert.equal(store.rows('osionos_bridge_identities')[0].username, 'ada');
	});
});

describe('the deletion request', () => {
	it('refuses without a step-up proof', async (t) => {
		const { base, token } = await world(t, { sudo: false });
		const response = await send(base, '/api/account/deletion', { method: 'POST', token, body: {} });
		assert.equal(response.status, 403);
		assert.equal(response.body.code, 'sudo_required');
	});

	it('opens the request and answers the schedule', async (t) => {
		const { base, token, store } = await world(t);
		const response = await send(base, '/api/account/deletion', { method: 'POST', token, body: {} });
		assert.equal(response.status, 201);
		assert.ok(Date.parse(response.body.scheduledFor) - Date.parse(response.body.requestedAt) >= GRACE_MS);
		const row = store.rows('osionos_account_deletion_requests')[0];
		assert.equal(row.user_id, USER_A);
	});

	it('answers 409 with the row that is already open', async (t) => {
		const { base, token } = await world(t);
		const first = await send(base, '/api/account/deletion', { method: 'POST', token, body: {} });
		const second = await send(base, '/api/account/deletion', { method: 'POST', token, body: {} });
		assert.equal(second.status, 409);
		assert.equal(second.body.code, 'deletion_already_requested');
		assert.equal(second.body.requestedAt, first.body.requestedAt);
		assert.equal(second.body.scheduledFor, first.body.scheduledFor);
	});

	it('reads the request back, and 404s when there is none', async (t) => {
		const { base, token } = await world(t);
		const empty = await send(base, '/api/account/deletion', { token });
		assert.equal(empty.status, 404);
		assert.equal(empty.body.code, 'deletion_not_found');
		await send(base, '/api/account/deletion', { method: 'POST', token, body: {} });
		const row = await send(base, '/api/account/deletion', { token });
		assert.equal(row.status, 200);
		assert.ok(Date.parse(row.body.scheduledFor) - Date.parse(row.body.requestedAt) >= GRACE_MS);
	});

	it('cancels the request without a proof, and the row is gone', async (t) => {
		const { base, token, store } = await world(t);
		await send(base, '/api/account/deletion', { method: 'POST', token, body: {} });
		const cancelled = await send(base, '/api/account/deletion', { method: 'DELETE', token });
		assert.equal(cancelled.status, 204);
		assert.equal(store.rows('osionos_account_deletion_requests').length, 0);
	});

	it('refuses a successor that is in no workspace the caller owns', async (t) => {
		const { base, token, store } = await world(t, { rows: { members: [] } });
		const response = await send(base, '/api/account/deletion', { method: 'POST', token, body: { successorUserId: SUCCESSOR } });
		assert.equal(response.status, 422);
		assert.equal(response.body.code, 'invalid_successor');
		assert.equal(store.rows('osionos_account_deletion_requests').length, 0);
	});

	it('accepts a successor that is a member of a workspace the caller owns', async (t) => {
		const { base, token, store } = await world(t);
		const response = await send(base, '/api/account/deletion', { method: 'POST', token, body: { successorUserId: SUCCESSOR } });
		assert.equal(response.status, 201);
		assert.equal(store.rows('osionos_account_deletion_requests')[0].successor_user_id, SUCCESSOR);
	});

	it('answers 503 and writes nothing when the audit storage is down', async (t) => {
		const { base, token, store } = await world(t, {
			fail: (call) => (call.table === 'osionos_bridge_audit_events' ? { status: 500, body: { message: 'down' } } : null),
		});
		const response = await send(base, '/api/account/deletion', { method: 'POST', token, body: {} });
		assert.equal(response.status, 503);
		assert.equal(response.body.code, 'audit_unavailable');
		assert.equal(store.rows('osionos_account_deletion_requests').length, 0);
	});

	it('reads only the caller deletion request and never another user\'s', async (t) => {
		const rows = {
			profiles: [profileOf(USER_A), profileOf(USER_B)],
			deletions: [
				{ user_id: USER_A, requested_at: '2026-10-02T00:00:00.000Z', scheduled_for: '2026-10-16T00:00:00.000Z', successor_user_id: null },
				{ user_id: USER_B, requested_at: '2026-10-03T00:00:00.000Z', scheduled_for: '2026-10-17T00:00:00.000Z', successor_user_id: null },
			],
		};
		const { base, token, store } = await world(t, { rows });
		const response = await send(base, '/api/account/deletion', { token });
		assert.equal(response.status, 200);
		assert.equal(response.body.requestedAt, '2026-10-02T00:00:00.000Z');
		const call = store.callsTo('osionos_account_deletion_requests').find((entry) => entry.method === 'GET');
		assert.ok(call, 'the read goes through the deletion table');
		assert.equal(call.claims?.aud, 'osionos-account');
		assert.equal(call.claims?.role, 'osionos_account_user');
		assert.equal(call.claims?.sub, USER_A);
	});

	it('keeps the request when the audit of the cancellation fails', async (t) => {
		const { base, token, store } = await world(t, {
			fail: (call) => (call.table === 'osionos_bridge_audit_events' && call.body?.event_type === 'account.deletion_cancelled'
				? { status: 500, body: { message: 'down' } } : null),
		});
		await send(base, '/api/account/deletion', { method: 'POST', token, body: {} });
		const response = await send(base, '/api/account/deletion', { method: 'DELETE', token });
		assert.equal(response.status, 503);
		assert.equal(response.body.code, 'audit_unavailable');
		assert.equal(store.rows('osionos_account_deletion_requests').length, 1);
	});
});

const ACCEPT = '/api/account/deletion/successor/accept';
const OPEN_ROW = { requested_at: '2026-10-02T00:00:00.000Z', scheduled_for: '2026-10-16T00:00:00.000Z' };

async function identity(t, { rows = {}, failNotification = false, as = USER_A } = {}) {
	const kv = createTtlKv();
	const built = await startIdentityWorld(t, {
		kv,
		failNotification,
		rows: {
			profiles: [profileOf(USER_A)],
			workspaces: [{ id: WORKSPACE, owner_id: USER_A, name: 'Home' }],
			members: [{ workspace_id: WORKSPACE, user_id: SUCCESSOR, role: 'member' }],
			...rows,
		},
	});
	return { ...built, token: await sudoToken(built.config, kv, as) };
}

describe('the deletion executor seams', () => {
	for (const [label, erasedAt, expected] of [['a plain request', null, false], ['a lease or failed attempt', null, false], ['an erased request', '2026-11-20T00:00:00.000Z', true]]) {
		it(`reports inProgress=${expected} for ${label}`, async (t) => {
			const { base, token } = await identity(t, { rows: { deletions: [{ user_id: USER_A, ...OPEN_ROW, successor_user_id: null, erased_at: erasedAt, claimed_at: '2026-11-19T00:00:00.000Z', attempts: 2 }] } });
			const response = await send(base, '/api/account/deletion', { token });
			assert.equal(response.status, 200);
			assert.equal(response.body.inProgress, expected);
		});
	}

	it('answers 409 deletion_in_progress when the request was erased, and 204 before', async (t) => {
		const erased = await identity(t, { rows: { deletions: [{ user_id: USER_A, ...OPEN_ROW, successor_user_id: null, erased_at: '2026-11-20T00:00:00.000Z' }] } });
		const refused = await send(erased.base, '/api/account/deletion', { method: 'DELETE', token: erased.token });
		assert.equal(refused.status, 409);
		assert.equal(refused.body.code, 'deletion_in_progress');
		const plain = await identity(t, { rows: { deletions: [{ user_id: USER_A, ...OPEN_ROW, successor_user_id: null, erased_at: null }] } });
		assert.equal((await send(plain.base, '/api/account/deletion', { method: 'DELETE', token: plain.token })).status, 204);
	});

	it('lets the successor accept, and nobody else', async (t) => {
		const rows = { deletions: [{ user_id: USER_A, ...OPEN_ROW, successor_user_id: SUCCESSOR, erased_at: null }] };
		const wrong = await identity(t, { rows, as: USER_B });
		const refused = await send(wrong.base, ACCEPT, { method: 'POST', token: wrong.token, body: { requesterUserId: USER_A } });
		assert.equal(refused.status, 403);
		assert.equal(refused.body.code, 'not_successor');
		const right = await identity(t, { rows, as: SUCCESSOR });
		const accepted = await send(right.base, ACCEPT, { method: 'POST', token: right.token, body: { requesterUserId: USER_A } });
		assert.equal(accepted.status, 200);
		assert.ok(right.store.rows('osionos_account_deletion_requests')[0].successor_accepted_at);
		assert.equal(right.store.rows('osionos_bridge_audit_events').at(-1).event_type, 'account.successor_accepted');
	});

	it('refuses to accept an erased request and a malformed requester', async (t) => {
		const { base, token } = await identity(t, { as: SUCCESSOR, rows: { deletions: [{ user_id: USER_A, ...OPEN_ROW, successor_user_id: SUCCESSOR, erased_at: '2026-11-20T00:00:00.000Z' }] } });
		const erased = await send(base, ACCEPT, { method: 'POST', token, body: { requesterUserId: USER_A } });
		assert.equal(erased.status, 409);
		const bad = await send(base, ACCEPT, { method: 'POST', token, body: { requesterUserId: 'nope' } });
		assert.equal(bad.status, 422);
	});

	it('tells the named successor with one system notification that holds no id or name', async (t) => {
		const { base, token, store } = await identity(t);
		const response = await send(base, '/api/account/deletion', { method: 'POST', token, body: { successorUserId: SUCCESSOR } });
		assert.equal(response.status, 201);
		const notes = store.rows('osionos_notifications');
		assert.equal(notes.length, 1);
		assert.equal(notes[0].type, 'system');
		assert.equal(notes[0].user_id, SUCCESSOR);
		const text = JSON.stringify(notes[0]);
		assert.equal(text.includes(USER_A) || text.includes('Ada'), false);
	});

	it('still answers 201 when the notification cannot be written', async (t) => {
		const { base, token, store } = await identity(t, { failNotification: true });
		const response = await send(base, '/api/account/deletion', { method: 'POST', token, body: { successorUserId: SUCCESSOR } });
		assert.equal(response.status, 201);
		assert.equal(store.rows('osionos_notifications').length, 0);
	});
});
