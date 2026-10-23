/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-social-follows.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */



// The follow graph through the social handler: idempotent follow and unfollow, the counts in
// one request, keyset lists with a constant request count, and the 4xx a bad call earns.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSocialHandler } from '../../scripts/bridge-social.mjs';
import { kvStub } from './support/kv-stub.mjs';
import { callRoute } from './support/route-call.mjs';
import { CONFIG, createFollowStore, uid } from './support/follow-postgrest.mjs';

const ME = uid(1);
const people = [2, 3, 4, 5, 6, 7].map((n) => ({ user_id: uid(n), display_name: `Person ${n}`, profile: { headline: `Headline ${n}` } }));
const at = (minute) => `2026-10-22T10:${String(minute).padStart(2, '0')}:00.000000+00:00`;

function world(overrides = {}) {
	const store = createFollowStore({ users: [{ user_id: ME, display_name: 'Me', profile: {} }, ...people], ...overrides });
	const handler = createSocialHandler({ config: CONFIG, verifySession: () => ({ userId: ME }), fetchImpl: store.fetchImpl, kv: kvStub() });
	const call = (method, path, body, headers) => callRoute(handler, { method, path, body, headers });
	return { store, call };
}

describe('follow and unfollow', () => {
	it('is idempotent in both directions and can follow again after unfollowing', async () => {
		const { store, call } = world();
		const followee = uid(2);
		for (let again = 0; again < 2; again += 1) {
			const followed = await call('POST', '/api/social/follow', { followeeId: followee });
			assert.deepEqual([followed.status, followed.body], [200, { ok: true, following: true }]);
		}
		assert.equal(store.follows.length, 1);
		for (let again = 0; again < 2; again += 1) {
			const left = await call('DELETE', `/api/social/follow/${followee}`);
			assert.deepEqual([left.status, left.body], [200, { ok: true, following: false }]);
		}
		assert.equal(store.follows.length, 0);
		assert.equal((await call('POST', '/api/social/follow', { followeeId: followee })).status, 200);
		assert.equal(store.follows.length, 1);
	});

	const refusals = [
		['yourself', { followeeId: ME }, 422],
		['an id that is not a UUID', { followeeId: 'not-a-uuid' }, 422],
		['no id at all', {}, 422],
		['a user who does not exist', { followeeId: uid(99) }, 404],
	];
	for (const [label, body, status] of refusals) {
		it(`refuses to follow ${label} with ${status} and writes nothing`, async () => {
			const { store, call } = world();
			const answer = await call('POST', '/api/social/follow', body);
			assert.equal(answer.status, status);
			assert.equal(answer.body.ok, false);
			assert.equal(store.callsTo('osionos_follows', 'POST').length, 0);
		});
	}

	it('answers 401 without a bearer token', async () => {
		const store = createFollowStore({});
		const handler = createSocialHandler({ config: CONFIG, verifySession: () => ({ userId: ME }), fetchImpl: store.fetchImpl });
		const answer = await callRoute(handler, { method: 'POST', path: '/api/social/follow', body: { followeeId: uid(2) }, headers: { authorization: '' } });
		assert.equal(answer.status, 401);
	});
});

describe('the counts', () => {
	it('come from one request and carry all three numbers', async () => {
		const follows = [
			{ follower_id: ME, followee_id: uid(2), created_at: at(1) },
			{ follower_id: uid(3), followee_id: uid(2), created_at: at(2) },
			{ follower_id: uid(4), followee_id: uid(2), created_at: at(3) },
			{ follower_id: uid(2), followee_id: uid(5), created_at: at(4) },
		];
		const { store, call } = world({ follows });
		const answer = await call('GET', `/api/social/follow-counts/${uid(2)}`);
		assert.deepEqual(answer.body, { ok: true, followerCount: 3, followingCount: 1, viewerFollows: true });
		assert.equal(store.calls.length, 1);
		assert.deepEqual(store.calls[0].body, { p_user: uid(2), p_viewer: ME });
	});

	it('refuse an id that is not a UUID without asking the database', async () => {
		const { store, call } = world();
		assert.equal((await call('GET', '/api/social/follow-counts/not-a-uuid')).status, 404);
		assert.equal(store.calls.length, 0);
	});
});

describe('the lists', () => {
	const followers = [2, 3, 4, 5, 6].map((n, index) => ({ follower_id: uid(n), followee_id: uid(7), created_at: at(index) }));

	it('page through the followers newest first, without a duplicate, and end on a null cursor', async () => {
		const { call } = world({ follows: followers });
		const seen = [];
		let cursor = null;
		for (let page = 0; page < 3; page += 1) {
			const answer = await call('GET', `/api/social/followers/${uid(7)}?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
			assert.equal(answer.status, 200);
			seen.push(...answer.body.items.map((item) => item.id));
			cursor = answer.body.nextCursor;
		}
		assert.deepEqual(seen, [uid(6), uid(5), uid(4), uid(3), uid(2)]);
		assert.equal(cursor, null);
	});

	it('page through the following list by the followee id', async () => {
		const following = [2, 3, 4].map((n, index) => ({ follower_id: ME, followee_id: uid(n), created_at: at(index) }));
		const { call } = world({ follows: following });
		const first = await call('GET', `/api/social/following/${ME}?limit=2`);
		assert.deepEqual(first.body.items.map((item) => item.id), [uid(4), uid(3)]);
		const second = await call('GET', `/api/social/following/${ME}?limit=2&cursor=${first.body.nextCursor}`);
		assert.deepEqual(second.body.items.map((item) => item.id), [uid(2)]);
		assert.equal(second.body.nextCursor, null);
	});

	it('give each person the same six fields, with following set for the viewer', async () => {
		const { call } = world({ follows: [...followers, { follower_id: ME, followee_id: uid(3), created_at: at(9) }] });
		const answer = await call('GET', `/api/social/followers/${uid(7)}?limit=10`);
		const three = answer.body.items.find((item) => item.id === uid(3));
		assert.deepEqual(Object.keys(three).sort(), ['avatar', 'following', 'headline', 'id', 'name', 'online']);
		assert.equal(three.name, 'Person 3');
		assert.equal(three.headline, 'Headline 3');
		assert.equal(three.following, true);
	});

	it('mark the people the viewer follows', async () => {
		const { call } = world({ follows: [...followers, { follower_id: ME, followee_id: uid(4), created_at: at(9) }] });
		const answer = await call('GET', `/api/social/followers/${uid(7)}?limit=10`);
		const flags = Object.fromEntries(answer.body.items.map((item) => [item.id, item.following]));
		assert.equal(flags[uid(4)], true);
		assert.equal(flags[uid(5)], false);
	});

	it('cost the same number of requests for a page of 2 and a page of 5', async () => {
		const small = world({ follows: followers });
		const large = world({ follows: followers });
		await small.call('GET', `/api/social/followers/${uid(7)}?limit=2`);
		await large.call('GET', `/api/social/followers/${uid(7)}?limit=5`);
		assert.equal(small.store.calls.length, large.store.calls.length);
		assert.ok(small.store.calls.length <= 4, `${small.store.calls.length} requests`);
	});

	const invalid = [
		['a cursor that is not base64url', 'cursor=%%%'],
		['a cursor of the wrong arity', `cursor=${Buffer.from('["one"]').toString('base64url')}`],
	];
	for (const [label, query] of invalid) {
		it(`answer 422 invalid_cursor for ${label}`, async () => {
			const { call } = world({ follows: followers });
			const answer = await call('GET', `/api/social/followers/${uid(7)}?${query}`);
			assert.equal(answer.status, 422);
			assert.equal(answer.body.code, 'invalid_cursor');
		});
	}

	it('answer 404 for a user id that is not a UUID', async () => {
		const { call } = world();
		assert.equal((await call('GET', '/api/social/followers/not-a-uuid')).status, 404);
	});
});
