/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-audit.test.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The audit viewer API: the admin gate that re-reads the roles, the keyset list, and the
 * projection that keeps ip_hash and user_agent (and sensitive details keys) out of the answer.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encodeCursor } from '../../scripts/bridge-paging.mjs';
import { USER_A, USER_B, send } from './support/account-world.mjs';
import { roleTables, startAdminWorld, tokenFor } from './support/admin-route-world.mjs';

const AUDIT = '/api/account/admin/audit';
const TABLE = 'osionos_bridge_audit_events';
const SELECT = 'id,created_at,event_type,actor_id,subject,provider,details';

function event(n, extra = {}) {
	const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
	return { id, created_at: `2026-10-0${n}T00:00:00.000Z`, event_type: 'admin_user_update', actor_id: USER_A, subject: USER_A, provider: 'osionos', details: { fields: ['displayName'] }, ip_hash: 'HASH-SECRET', user_agent: 'UA-SECRET', session_id: 'SESSION-SECRET', ...extra };
}

const seed = (grants, events = [event(1), event(2), event(3)]) => ({ ...roleTables(grants), [TABLE]: events });
const world = (t, grants, events) => startAdminWorld(t, { path: AUDIT, tables: seed(grants, events) });

describe('the keyset list', () => {
	it('orders newest first, filters the second page by the cursor and answers it', async (t) => {
		const { call, store } = await world(t);
		const first = await call('?limit=2');
		assert.equal(first.status, 200);
		assert.deepEqual(first.body.events.map((e) => e.createdAt), ['2026-10-03T00:00:00.000Z', '2026-10-02T00:00:00.000Z']);
		assert.equal(typeof first.body.nextCursor, 'string');
		const read = store.callsTo(TABLE)[0];
		assert.equal(read.params.get('order'), 'created_at.desc,id.desc');
		assert.equal(read.params.get('provider'), 'eq.osionos');
		assert.equal(read.params.has('or'), false);

		const second = await call(`?limit=2&cursor=${first.body.nextCursor}`);
		assert.deepEqual(second.body.events.map((e) => e.createdAt), ['2026-10-01T00:00:00.000Z']);
		assert.equal(second.body.nextCursor, null);
		assert.match(store.callsTo(TABLE)[1].params.get('or'), /^\(created_at\.lt\./);
	});

	it('selects exactly the seven columns, so ip_hash and user_agent never reach the answer', async (t) => {
		const { call, store } = await world(t);
		const answer = await call('');
		assert.equal(store.callsTo(TABLE)[0].params.get('select'), SELECT);
		assert.deepEqual(Object.keys(answer.body.events[0]).sort(), ['actorId', 'createdAt', 'details', 'eventType', 'id', 'provider', 'subject']);
		for (const secret of ['HASH-SECRET', 'UA-SECRET', 'SESSION-SECRET']) assert.equal(answer.text.includes(secret), false, secret);
	});

	it('drops a details key that names a token, an address or an email, and keeps the rest', async (t) => {
		const details = { fields: ['displayName'], targetUserId: USER_B, accessToken: 'TOKEN-SECRET', ip: '10.0.0.1', email: 'a@example.com', nested: { deep: 1 } };
		const { call } = await world(t, undefined, [event(1, { details })]);
		const answer = await call('');
		assert.deepEqual(answer.body.events[0].details, { fields: ['displayName'], targetUserId: USER_B });
		for (const secret of ['TOKEN-SECRET', '10.0.0.1', 'example.com']) assert.equal(answer.text.includes(secret), false, secret);
	});

	it('filters by event type and actor, and refuses a malformed filter', async (t) => {
		const { call, store } = await world(t);
		await call(`?eventType=admin_role_change&actorId=${USER_A}`);
		const params = store.callsTo(TABLE)[0].params;
		assert.equal(params.get('event_type'), 'eq.admin_role_change');
		assert.equal(params.get('actor_id'), `eq.${USER_A}`);
		assert.equal((await call('?actorId=nope')).body.code, 'invalid_actor_id');
		assert.equal((await call('?eventType=a,b)')).body.code, 'invalid_event_type');
	});

	it('refuses a tampered cursor and caps the limit at 100', async (t) => {
		const { call, store } = await world(t);
		const bad = await call('?cursor=not-a-cursor!');
		assert.equal(bad.status, 422);
		assert.equal(bad.body.code, 'invalid_cursor');
		assert.equal((await call(`?cursor=${encodeCursor(['only-one'])}`)).body.code, 'invalid_cursor');
		await call('?limit=1000');
		assert.equal(store.callsTo(TABLE).at(-1).params.get('limit'), '101');
	});
});

describe('the gate re-reads the roles', () => {
	it('refuses a token that claims admin when the grants say user, before the audit table is read', async (t) => {
		const { base, config, store } = await world(t, [{ userId: USER_B, role: 'user' }]);
		const answer = await send(base, AUDIT, { token: tokenFor(config, USER_B, true) });
		assert.equal(answer.status, 403);
		assert.equal(answer.body.code, 'admin_required');
		assert.equal(store.callsTo(TABLE).length, 0);
	});

	it('refuses a moderator, an admin claim with no grant, and a missing session', async (t) => {
		const { base, config, store } = await world(t, [{ userId: USER_B, role: 'moderator' }]);
		assert.equal((await send(base, AUDIT, { token: tokenFor(config, USER_B) })).body.code, 'admin_required');
		assert.equal((await send(base, AUDIT, { token: tokenFor(config, USER_A, true) })).body.code, 'admin_required');
		assert.equal((await send(base, AUDIT)).status, 401);
		assert.equal(store.callsTo(TABLE).length, 0);
	});
});
