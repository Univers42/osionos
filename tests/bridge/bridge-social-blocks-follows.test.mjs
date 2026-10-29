/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-social-blocks-follows.test.mjs              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */



// A block wins over a follow: it refuses the follow in both directions, empties or thins
// the lists, and strips presence and status from the profile card it hides.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSocialHandler } from '../../scripts/bridge-social.mjs';
import { createProfileHandler } from '../../scripts/bridge-profile.mjs';
import { kvStub } from './support/kv-stub.mjs';
import { callRoute } from './support/route-call.mjs';
import { CONFIG, createFollowStore, uid } from './support/follow-postgrest.mjs';

const ME = uid(1);
const OTHER = uid(2);
const users = [1, 2, 3].map((n) => ({ user_id: uid(n), display_name: `Person ${n}`, profile: {} }));
const at = (minute) => `2026-10-22T10:${String(minute).padStart(2, '0')}:00.000000+00:00`;

function world(overrides = {}) {
	const store = createFollowStore({ users, ...overrides });
	const kv = kvStub();
	const social = createSocialHandler({ config: CONFIG, verifySession: () => ({ userId: ME }), fetchImpl: store.fetchImpl, kv });
	return { store, kv, call: (method, path, body) => callRoute(social, { method, path, body }) };
}

const blockCases = [
	['the followee blocked the caller', { blocker_id: OTHER, blocked_id: ME }],
	['the caller blocked the followee', { blocker_id: ME, blocked_id: OTHER }],
];

describe('a block prevents a follow', () => {
	for (const [label, block] of blockCases) {
		it(`answers 403 follow_blocked when ${label}, and inserts nothing`, async () => {
			const { store, call } = world({ blocks: [block] });
			const answer = await call('POST', '/api/social/follow', { followeeId: OTHER });
			assert.equal(answer.status, 403);
			assert.equal(answer.body.code, 'follow_blocked');
			assert.equal(store.callsTo('osionos_follows', 'POST').length, 0);
		});
	}

	it('maps the 23514 the trigger raises in a race to the same 403', async () => {
		const { store, call } = world({ raceBlocked: new Set([OTHER]) });
		const answer = await call('POST', '/api/social/follow', { followeeId: OTHER });
		assert.equal(answer.status, 403);
		assert.equal(answer.body.code, 'follow_blocked');
		assert.equal(store.follows.length, 0);
	});

	it('lets an unblocked follow through', async () => {
		const { call } = world({ blocks: [{ blocker_id: uid(3), blocked_id: OTHER }] });
		assert.equal((await call('POST', '/api/social/follow', { followeeId: OTHER })).status, 200);
	});
});

describe('a block thins the lists', () => {
	const follows = [
		{ follower_id: uid(3), followee_id: uid(9), created_at: at(1) },
		{ follower_id: OTHER, followee_id: uid(9), created_at: at(2) },
	];

	it('hides a blocked person from the followers of someone else', async () => {
		const { call } = world({ follows, blocks: [{ blocker_id: OTHER, blocked_id: ME }] });
		const answer = await call('GET', `/api/social/followers/${uid(9)}`);
		assert.deepEqual(answer.body.items.map((item) => item.id), [uid(3)]);
	});

	it('answers an empty list when the list owner blocked the viewer', async () => {
		const { call } = world({ follows, blocks: [{ blocker_id: uid(9), blocked_id: ME }] });
		const answer = await call('GET', `/api/social/followers/${uid(9)}`);
		assert.deepEqual([answer.status, answer.body.items, answer.body.nextCursor], [200, [], null]);
	});
});

describe('a block strips the profile card', () => {
	const identity = { user_id: OTHER, display_name: 'Other', username: 'other', profile: { headline: 'Hi' }, directory_opt_out: false };
	const status = { user_id: OTHER, status_emoji: 'x', status_text: 'in a meeting', status_expires_at: null, status_busy: true };

	async function card(blocks) {
		const store = createFollowStore({ blocks, tables: { osionos_bridge_identities: [identity], osionos_profiles: [status], osionos_workspace_members: [] } });
		const kv = kvStub();
		await kv.set(`presence:v2:${OTHER}`, JSON.stringify({ ts: Date.now(), state: 'dnd', customText: 'deep work' }), 90_000);
		const profile = createProfileHandler({ config: CONFIG, verifySession: () => ({ userId: ME }), fetchImpl: store.fetchImpl, kv });
		return callRoute(profile, { method: 'GET', path: `/api/profile/${OTHER}` });
	}

	it('shows presence and status to a viewer who is not blocked', async () => {
		const answer = await card([]);
		assert.deepEqual(answer.body.presence, { state: 'dnd', customText: 'deep work' });
		assert.equal(answer.body.status.text, 'in a meeting');
	});

	for (const [label, block] of blockCases) {
		it(`leaves no presence, status or custom text when ${label}`, async () => {
			const answer = await card([block]);
			assert.equal(answer.status, 200);
			assert.deepEqual(Object.keys(answer.body).sort(), ['avatar', 'name', 'ok', 'userId']);
			assert.doesNotMatch(answer.text, /deep work|in a meeting|dnd/);
		});
	}
});
