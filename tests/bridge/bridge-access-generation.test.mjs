/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-access-generation.test.mjs                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The two primitives of the collab access cache, in isolation from the bridge: the TTL clamp,
// the verdict cache's store rules, and the generation scopes. The route-level behaviour is in
// bridge-collab-auth-cache.test.mjs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SessionRevocations } from '../../scripts/bridge-session-revocations.mjs';
import { accessTicket, bumpAccess, bumpAccessAfter, ticketIsCurrent, touchesPageAccess } from '../../scripts/bridge-access-generation.mjs';
import { DEFAULT_TTL_MS, TTL_CAP_MS, authCacheTtlMs, createCollabAuthCache } from '../../scripts/bridge-collab-auth-cache.mjs';

const WS = 'ws-generation-test-1';
const USER = 'user-generation-test-1';
const SCOPE = { userId: USER, workspaceId: WS, pageId: 'page-1', kind: 'write' };

function cacheAt(ttl, clock) {
	return createCollabAuthCache({ env: { COLLAB_AUTH_CACHE: '1', COLLAB_AUTH_CACHE_TTL_MS: String(ttl) }, now: () => clock.at });
}

function counted() {
	const calls = { n: 0 };
	return { calls, check: async () => { calls.n += 1; } };
}

describe('collab auth cache: the TTL', () => {
	it('is off unless COLLAB_AUTH_CACHE is exactly 1', () => {
		for (const env of [{}, { COLLAB_AUTH_CACHE: '0' }, { COLLAB_AUTH_CACHE: 'true' }, { COLLAB_AUTH_CACHE_TTL_MS: '1000' }]) assert.equal(authCacheTtlMs(env), 0);
	});

	it('defaults, clamps to the 5000 ms cap, and treats junk as off', () => {
		const ttl = (value) => authCacheTtlMs({ COLLAB_AUTH_CACHE: '1', COLLAB_AUTH_CACHE_TTL_MS: value });
		assert.equal(authCacheTtlMs({ COLLAB_AUTH_CACHE: '1' }), DEFAULT_TTL_MS);
		assert.equal(ttl('1500'), 1500);
		assert.equal(ttl('99999'), TTL_CAP_MS);
		assert.equal(ttl('-5'), 0);
		assert.equal(ttl('0'), 0);
		assert.equal(ttl('abc'), 0);
		assert.equal(TTL_CAP_MS, 5000);
	});
});

describe('collab auth cache: the verdict store', () => {
	it('runs the check once inside the TTL and again after it', async () => {
		const clock = { at: 1000 };
		const cache = cacheAt(500, clock);
		const { calls, check } = counted();
		await cache.authorize(SCOPE, check);
		clock.at += 499;
		await cache.authorize(SCOPE, check);
		assert.equal(calls.n, 1);
		clock.at += 2;
		await cache.authorize(SCOPE, check);
		assert.equal(calls.n, 2);
	});

	it('keys on user, workspace, page and class', async () => {
		const cache = cacheAt(500, { at: 0 });
		const { calls, check } = counted();
		await cache.authorize(SCOPE, check);
		for (const other of [{ userId: 'u2' }, { workspaceId: 'w2' }, { pageId: 'p2' }, { kind: 'read' }]) await cache.authorize({ ...SCOPE, ...other }, check);
		assert.equal(calls.n, 5);
	});

	it('never stores a denial or a failed revalidate', async () => {
		const cache = cacheAt(500, { at: 0 });
		const { calls, check } = counted();
		const deny = async () => { calls.n += 1; throw new Error('denied'); };
		await assert.rejects(cache.authorize(SCOPE, deny), /denied/);
		await assert.rejects(cache.authorize(SCOPE, deny), /denied/);
		assert.equal(calls.n, 2);
		await cache.authorize(SCOPE, check);
		assert.equal(calls.n, 3);
	});

	it('always runs the check for an event with no cacheable class', async () => {
		const cache = cacheAt(500, { at: 0 });
		const { calls, check } = counted();
		await cache.authorize({ ...SCOPE, kind: null }, check);
		await cache.authorize({ ...SCOPE, kind: null }, check);
		assert.equal(calls.n, 2);
	});

	it('does not store a verdict when a write lands while it is being read', async () => {
		const cache = cacheAt(500, { at: 0 });
		const { calls, check } = counted();
		await cache.authorize(SCOPE, async () => { calls.n += 1; bumpAccess({ workspaceId: SCOPE.workspaceId }); });
		await cache.authorize(SCOPE, check);
		assert.equal(calls.n, 2);
		await cache.authorize(SCOPE, check);
		assert.equal(calls.n, 2);
	});

	it('is a plain pass-through when off', async () => {
		const cache = createCollabAuthCache({ env: {}, now: () => 0 });
		const { calls, check } = counted();
		await cache.authorize(SCOPE, check);
		await cache.authorize(SCOPE, check);
		assert.equal(calls.n, 2);
		assert.equal(cache.ttlMs, 0);
	});
});

describe('collab auth cache: generation scopes', () => {
	const stale = (scope) => {
		const ticket = accessTicket(USER, WS);
		bumpAccess(scope);
		return !ticketIsCurrent(ticket);
	};

	it('a workspace bump kills that workspace only', () => {
		assert.equal(stale({ workspaceId: WS }), true);
		assert.equal(stale({ workspaceId: 'another-workspace' }), false);
	});

	it('a user bump kills that user only, whatever the case of the id', () => {
		assert.equal(stale({ userId: USER.toUpperCase() }), true);
		assert.equal(stale({ userId: 'another-user' }), false);
	});

	it('an empty scope kills everything and a falsy scope kills nothing', async () => {
		assert.equal(stale({}), true);
		const ticket = accessTicket(USER, WS);
		await bumpAccessAfter(Promise.resolve('ok'), null);
		assert.equal(ticketIsCurrent(ticket), true);
	});

	it('bumpAccessAfter bumps after a write that threw, and returns its value', async () => {
		const ticket = accessTicket(USER, WS);
		await assert.rejects(bumpAccessAfter(Promise.reject(new Error('half written')), { workspaceId: WS }), /half written/);
		assert.equal(ticketIsCurrent(ticket), false);
		assert.equal(await bumpAccessAfter(Promise.resolve(7), { workspaceId: WS }), 7);
	});

	it('a page edit bumps only for the columns a verdict reads', () => {
		assert.equal(touchesPageAccess({ title: 'x', properties: [], content: 'y' }), false);
		for (const column of ['owner_id', 'workspace_id', 'visibility', 'collaborators', 'parent_page_id', 'archived_at']) assert.equal(touchesPageAccess({ [column]: null }), true);
	});

	it('a session revoke applied in this process kills every entry', () => {
		const ticket = accessTicket(USER, WS);
		const revocations = new SessionRevocations({ enforced: true, now: () => 1000, log: { info() {}, warn() {} } });
		revocations.applyLocal('00000000-0000-4000-8000-000000000001', 1000);
		assert.equal(ticketIsCurrent(ticket), false);
	});
});
