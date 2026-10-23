/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-presence-states.test.mjs                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */



// Four presence states in the key/value store: written by the heartbeat, read back with the
// invisible one hidden from everybody but its owner, and the ten-minute database budget held.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createKv } from '../../scripts/bridge-kv.mjs';
import { createProfileHandler } from '../../scripts/bridge-profile.mjs';
import { onlineAmong, presenceKey, PRESENCE_STATES } from '../../scripts/bridge-presence.mjs';
import { callRoute } from './support/route-call.mjs';
import { CONFIG, createFollowStore, uid } from './support/follow-postgrest.mjs';

const USER = uid(1);
const PEER = uid(2);
const START = Date.parse('2026-10-22T12:00:00.000Z');

function world(t, userId = USER) {
	t.mock.timers.enable({ apis: ['Date'], now: START });
	const kv = createKv({});
	t.after(() => kv.close());
	const identity = { user_id: userId, display_name: 'Me', username: 'me', profile: {}, directory_opt_out: false };
	const store = createFollowStore({ tables: { osionos_bridge_identities: [identity], osionos_workspace_members: [], osionos_profiles: [] } });
	const handler = createProfileHandler({ config: CONFIG, verifySession: () => ({ userId }), fetchImpl: store.fetchImpl, kv });
	const beat = (body) => callRoute(handler, { method: 'POST', path: '/api/profile/heartbeat', body });
	const profile = (id) => callRoute(handler, { method: 'GET', path: `/api/profile/${id}` });
	return { kv, store, beat, profile };
}

const seenBy = async (kv, viewerId, ids = [USER]) => onlineAmong(kv, ids, { viewerId });

describe('the four states', () => {
	for (const state of PRESENCE_STATES) {
		it(`writes ${state} and reads it back to its owner`, async (t) => {
			const { kv, beat } = world(t);
			assert.equal((await beat({ state, customText: 'in the zone' })).status, 204);
			const entry = (await seenBy(kv, USER)).get(USER);
			assert.deepEqual([entry.state, entry.customText], [state, 'in the zone']);
		});
	}

	it('exposes exactly online, away, dnd and invisible', () => {
		assert.deepEqual([...PRESENCE_STATES], ['online', 'away', 'dnd', 'invisible']);
	});

	it('defaults to online for a beat with no body', async (t) => {
		const { kv, beat } = world(t);
		await beat(undefined);
		assert.equal((await seenBy(kv, PEER)).get(USER).state, 'online');
	});

	it('shows the other three states to another viewer', async (t) => {
		const { kv, beat } = world(t);
		await beat({ state: 'dnd', customText: 'deep work' });
		const entry = (await seenBy(kv, PEER)).get(USER);
		assert.deepEqual([entry.state, entry.customText], ['dnd', 'deep work']);
	});
});

describe('invisible', () => {
	it('is offline for another viewer and for a read with no viewer', async (t) => {
		const { kv, beat } = world(t);
		await beat({ state: 'invisible' });
		assert.equal((await seenBy(kv, PEER)).has(USER), false);
		assert.equal((await onlineAmong(kv, [USER])).has(USER), false);
	});

	it('is the true state for its owner', async (t) => {
		const { kv, beat } = world(t);
		await beat({ state: 'invisible' });
		assert.equal((await seenBy(kv, USER)).get(USER).state, 'invisible');
	});

	it('shows on the profile as offline to another viewer and as invisible to the owner', async (t) => {
		const owner = world(t);
		await owner.beat({ state: 'invisible' });
		assert.equal((await owner.profile(USER)).body.presence.state, 'invisible');
		const other = createProfileHandler({ config: CONFIG, verifySession: () => ({ userId: PEER }), fetchImpl: owner.store.fetchImpl, kv: owner.kv });
		const answer = await callRoute(other, { method: 'GET', path: `/api/profile/${USER}` });
		assert.deepEqual([answer.body.online, answer.body.presence.state], [false, 'offline']);
	});
});

describe('what a beat keeps and changes', () => {
	it('keeps the previous state and text when the beat names neither', async (t) => {
		const { kv, beat } = world(t);
		await beat({ state: 'away', customText: 'lunch' });
		await beat({});
		const entry = (await seenBy(kv, PEER)).get(USER);
		assert.deepEqual([entry.state, entry.customText], ['away', 'lunch']);
	});

	it('clears the text when customText is null and keeps the state', async (t) => {
		const { kv, beat } = world(t);
		await beat({ state: 'away', customText: 'lunch' });
		await beat({ customText: null });
		const entry = (await seenBy(kv, PEER)).get(USER);
		assert.deepEqual([entry.state, entry.customText ?? null], ['away', null]);
	});

	const refused = [
		['an unknown state', { state: 'busy' }],
		['a state that is not a string', { state: 3 }],
		['a text of 121 characters', { customText: 'x'.repeat(121) }],
		['a text that is not a string', { customText: 7 }],
		['a body that is an array', ['online']],
	];
	for (const [label, body] of refused) {
		it(`answers 422 for ${label} and writes nothing`, async (t) => {
			const { kv, store, beat } = world(t);
			const answer = await beat(body);
			assert.equal(answer.status, 422);
			assert.equal(answer.body.ok, false);
			assert.equal(await kv.get(presenceKey(USER)), null);
			assert.equal(await kv.get(`presence:v2:${USER}`), null);
			assert.equal(store.calls.length, 0);
		});
	}
});

describe('the old key', () => {
	it('is read as online while it is fresh', async (t) => {
		const { kv } = world(t);
		await kv.set(presenceKey(PEER), String(Date.now()), 90_000);
		const entry = (await seenBy(kv, USER, [PEER])).get(PEER);
		assert.equal(entry.state, 'online');
	});

	it('is offline once its timestamp is 90 seconds old', async (t) => {
		const { kv } = world(t);
		await kv.set(presenceKey(PEER), String(START - 90_000), 90_000);
		assert.equal((await seenBy(kv, USER, [PEER])).has(PEER), false);
	});

	it('loses to the new key when both are there', async (t) => {
		const { kv } = world(t);
		await kv.set(presenceKey(PEER), String(Date.now()), 90_000);
		await kv.set(`presence:v2:${PEER}`, JSON.stringify({ ts: Date.now(), state: 'away', customText: null }), 90_000);
		assert.equal((await seenBy(kv, USER, [PEER])).get(PEER).state, 'away');
	});
});

describe('the database budget', () => {
	it('20 beats in 10 minutes make one presence upsert and one identity patch', async (t) => {
		const { store, beat } = world(t);
		for (let at = 0; at < 20; at += 1) {
			assert.equal((await beat({ state: 'away', customText: 'brb' })).status, 204);
			t.mock.timers.tick(30_000);
		}
		const upserts = store.callsTo('osionos_presence', 'POST');
		assert.equal(upserts.length, 1);
		assert.equal(store.callsTo('osionos_bridge_identities', 'PATCH').length, 1);
		assert.deepEqual([upserts[0].body.user_id, upserts[0].body.state, upserts[0].body.custom_text], [USER, 'away', 'brb']);
		assert.match(upserts[0].params.get('on_conflict'), /user_id/);
	});

	it('writes the default state online when the first beat names none', async (t) => {
		const { store, beat } = world(t);
		await beat(undefined);
		assert.equal(store.callsTo('osionos_presence', 'POST')[0].body.state, 'online');
	});

	it('an invisible beat records the state and leaves last_seen_at alone', async (t) => {
		const { store, beat } = world(t);
		assert.equal((await beat({ state: 'invisible' })).status, 204);
		assert.equal(store.callsTo('osionos_presence', 'POST')[0].body.state, 'invisible');
		assert.equal(store.callsTo('osionos_bridge_identities', 'PATCH').length, 0);
	});

	it('writes again after the ten minutes are over', async (t) => {
		const { store, beat } = world(t);
		await beat({});
		t.mock.timers.tick(600_001);
		await beat({});
		assert.equal(store.callsTo('osionos_presence', 'POST').length, 2);
	});
});
