/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-admin-demote-sticks.test.mjs                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// osionos#343: a demotion that answers 200 must stick. The target's old tokens die on every admin
// surface (D343-12), a sign-in or refresh that read the flag before the clear cannot write the
// grant or the membership back (D343-10), and the token it mints predates the cut-off (D343-11).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_WORKSPACE_ID } from '../../scripts/bridge-admin-rights.mjs';
import { parkFirst, startSticksWorld } from './support/demote-sticks-world.mjs';
import { refreshWith, signIn, tokenClaims } from './support/session-signin.mjs';
import { USER_B, gatewayRequest, postJson, sendJson } from './support/session-world.mjs';

// Each admin surface, with what it answers an admin: the console refuses the method after its
// admin check, the perms write reaches its (unconfigured) engine, the Claude route refuses the
// empty prompt. Every one of them is past the admin check, so a later 401 is the demotion's.
const SURFACES = [
	{ name: 'requireAdmin route (moderation console)', path: '/api/admin/moderation/queue', method: 'POST', body: '{}', admitted: 405 },
	{ name: 'users console', path: '/api/account/admin/users', method: 'GET', admitted: 200 },
	{ name: 'bridge-perms policy write', path: '/api/perms/policies', method: 'POST', body: '{}', admitted: 503 },
	{ name: 'Claude agent route', path: '/api/agent/claude/stream', method: 'POST', body: '{}', admitted: 422 },
];

const call = (base, token, { path, method, body }) =>
	sendJson(base, path, { method, body, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } });
const roleOf = (claims) => ({ is_admin: claims.is_admin, platform_role: claims.platform_role ?? null });
const pastTheCutoffMs = () => new Promise((done) => setTimeout(done, 2));

describe('a 200 demotion sticks on every admin surface (D343-12)', () => {
	it('the old token and its refresh family are refused; a fresh sign-in and its refresh are not admin', async (t) => {
		const world = await startSticksWorld(t);
		const before = await signIn(world.base, USER_B);
		assert.deepEqual(roleOf(before.claims), { is_admin: true, platform_role: 'admin' });
		assert.ok(before.claims.workspace_ids.includes(ADMIN_WORKSPACE_ID));
		for (const surface of SURFACES) {
			assert.equal((await call(world.base, before.accessToken, surface)).status, surface.admitted, surface.name);
		}

		assert.equal((await world.demote()).status, 200);

		for (const surface of SURFACES) {
			assert.equal((await call(world.base, before.accessToken, surface)).status, 401, surface.name);
		}
		assert.equal((await refreshWith(world.base, before.refreshToken)).status, 401);
		await pastTheCutoffMs();
		const after = await signIn(world.base, USER_B);
		assert.deepEqual(roleOf(after.claims), { is_admin: false, platform_role: null });
		assert.ok(!after.claims.workspace_ids.includes(ADMIN_WORKSPACE_ID));
		const rotated = await refreshWith(world.base, after.refreshToken);
		assert.equal(rotated.status, 200);
		assert.deepEqual(roleOf(tokenClaims(rotated.body.accessToken)), { is_admin: false, platform_role: null });
		assert.deepEqual([world.flagged().length, world.adminGrants().length, world.adminMembership().length], [0, 0, 0]);
	});
});

describe('a refresh or sign-in racing the demotion cannot bring the admin back (D343-10, D343-11)', () => {
	it('a refresh that read the flag before the clear and upserts after the delete: no grant, the minted token is refused', async (t) => {
		const world = await startSticksWorld(t);
		const before = await signIn(world.base, USER_B);
		const parked = parkFirst(world, ({ table, method }) => table.startsWith('user_roles') && method === 'POST');
		const refreshing = refreshWith(world.base, before.refreshToken);
		await parked.reached;

		assert.equal((await world.demote()).status, 200);
		parked.release();
		const rotated = await refreshing;

		assert.equal(world.adminGrants().length, 0);
		assert.equal(rotated.status, 200);
		assert.deepEqual(roleOf(tokenClaims(rotated.body.accessToken)), { is_admin: false, platform_role: null });
		assert.equal((await call(world.base, rotated.body.accessToken, SURFACES[1])).status, 401);
	});

	it('a sign-in that read the flag before the clear and writes the membership after the delete: none remains, the minted token is refused', async (t) => {
		const world = await startSticksWorld(t);
		const parked = parkFirst(world, ({ table, method, body }) => table.startsWith('osionos_workspace_members') && method === 'POST' && body?.workspace_id === ADMIN_WORKSPACE_ID);
		const request = gatewayRequest({ provider: 'prismatica', subject: USER_B, email: 'member@example.com', name: 'Member', jti: crypto.randomUUID() }, { timestamp: Date.now() });
		const minting = postJson(world.base, '/api/auth/bridge/session', { headers: request.headers, body: JSON.parse(request.body) });
		await parked.reached;

		assert.equal((await world.demote()).status, 200);
		parked.release();
		const minted = await minting;
		assert.equal(minted.status, 200);
		const token = new URL(minted.body.redirectUrl).hash.replace('#bridge_token=', '');
		const consumed = await postJson(world.base, '/api/auth/bridge/consume', { body: { token } });

		assert.deepEqual([world.adminMembership().length, world.adminGrants().length], [0, 0]);
		assert.equal(consumed.status, 200);
		const claims = tokenClaims(consumed.body.session.accessToken);
		assert.deepEqual(roleOf(claims), { is_admin: false, platform_role: null });
		assert.ok(!claims.workspace_ids.includes(ADMIN_WORKSPACE_ID));
		assert.equal((await call(world.base, consumed.body.session.accessToken, SURFACES[1])).status, 401);
	});
});
