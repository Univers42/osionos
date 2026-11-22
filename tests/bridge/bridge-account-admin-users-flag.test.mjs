// The users console refuses to revoke the admin role of an account whose identity flag is set
// (RULING-296 A296-7, A296-10, A296-11). Sign-in and refresh re-write the grant the flag implies,
// so such a revoke would be undone within the hour while the console reported success.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { USER_A, USER_B } from './support/account-world.mjs';
import { ROLE_IDS, roleTables, startAdminWorld } from './support/admin-route-world.mjs';

const USER_C = 'cccccccc-3333-4333-8333-cccccccccccc';
const USERS = '/api/account/admin/users';
const AUDIT = 'osionos_bridge_audit_events';
const IDENTITIES = 'osionos_bridge_identities';

// USER_B holds two identity rows and only the second carries the flag; USER_C has no flag.
function tables() {
	const grants = [{ userId: USER_A, role: 'admin' }, { userId: USER_B, role: 'admin' }];
	const identities = [{ user_id: USER_B, is_admin: false }, { user_id: USER_B, is_admin: true }, { user_id: USER_C, is_admin: false }];
	return { ...roleTables(grants), [IDENTITIES]: identities, [AUDIT]: [] };
}

const world = (t, options = {}) => startAdminWorld(t, { path: USERS, tables: tables(), ...options });
const put = (call, userId, role, action) => call(`/${userId}/roles`, { method: 'PUT', body: { role, action } });
const holds = (store, userId, role) => store.rows('user_roles').some((row) => row.user_id === userId && row.role_id === ROLE_IDS[role]);

describe('revoking the admin role of a flagged account', () => {
	it('answers 409 admin_flag_set, names the real demotion, and writes nothing', async (t) => {
		const { call, store } = await world(t);
		const answer = await put(call, USER_B, 'admin', 'revoke');
		assert.equal(answer.status, 409);
		assert.equal(answer.body.code, 'admin_flag_set');
		assert.match(answer.body.message, /osionos_bridge_identities\.is_admin/);
		assert.equal(store.callsTo(AUDIT).length, 0);
		assert.equal(holds(store, USER_B, 'admin'), true);
	});

	it('answers 503 when the flag cannot be read, and never reaches the delete', async (t) => {
		const { call, store } = await world(t, { failReads: (table) => table === IDENTITIES });
		const answer = await put(call, USER_B, 'admin', 'revoke');
		assert.equal(answer.status, 503);
		assert.equal(store.callsTo(AUDIT).length, 0);
		assert.equal(store.callsTo('user_roles').some((entry) => entry.method === 'DELETE'), false);
		assert.equal(holds(store, USER_B, 'admin'), true);
	});

	it('still lets a non-flagged admin be revoked: grant, revoke, the row is gone', async (t) => {
		const { call, store } = await world(t);
		assert.equal((await put(call, USER_C, 'admin', 'grant')).status, 200);
		assert.equal(holds(store, USER_C, 'admin'), true);
		const answer = await put(call, USER_C, 'admin', 'revoke');
		assert.equal(answer.status, 200);
		assert.equal(holds(store, USER_C, 'admin'), false);
	});

	it('still grants the admin role to a flagged account', async (t) => {
		const { call, store } = await world(t);
		store.rows('user_roles').splice(1, 1);
		const answer = await put(call, USER_B, 'admin', 'grant');
		assert.equal(answer.status, 200);
		assert.equal(holds(store, USER_B, 'admin'), true);
	});
});
