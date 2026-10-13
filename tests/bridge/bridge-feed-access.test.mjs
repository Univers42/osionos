/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-feed-access.test.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Feed engagement and the profile gallery show a page only to members of its workspace
// who may read it. Otherwise a feed GET answers like an id nobody engaged with, a feed
// write is a 404 that stores nothing, and the gallery omits the card. An id outside
// osionos_pages (a live-database record) keeps working as before.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const STRANGER = { userId: 'c1c1c1c1-5555-4555-8555-c1c1c1c1c1c1', home: 'c2c2c2c2-5555-4555-8555-c2c2c2c2c2c2' };
const LIVE_ID = 'eeeeeeee-9999-4999-8999-eeeeeeeeeeee';
const VIEWERS = {
	stranger: { ...STRANGER, pageId: IDS.sharedA, hidden: true },
	'member who cannot read': { userId: IDS.userB, home: IDS.homeB, pageId: IDS.privateA, hidden: true },
	'member who can read': { userId: IDS.userB, home: IDS.homeB, pageId: IDS.sharedA, hidden: false },
	'live-database id': { userId: IDS.userB, home: IDS.homeB, pageId: LIVE_ID, hidden: false },
};
const ACTIVITY = ['osionos_feed_likes', 'osionos_feed_reactions', 'osionos_feed_comments', 'osionos_feed_shares', 'osionos_notifications', 'osionos_pages'];
const json = (method, body) => ({ method, body: JSON.stringify(body) });
const commentId = (userId) => `${userId.slice(0, 8)}-cccc-4ccc-8ccc-cccccccccccc`;
const READS = ['likes', 'reactions', 'comments', 'share'];
const WRITES = {
	'POST like': (id) => [`/api/feed/${id}/like`, { method: 'POST' }],
	'DELETE like': (id) => [`/api/feed/${id}/like`, { method: 'DELETE' }],
	'POST reactions': (id) => [`/api/feed/${id}/reactions`, json('POST', { emoji: '🎉' })],
	'DELETE reactions': (id) => [`/api/feed/${id}/reactions`, json('DELETE', { emoji: '👍' })],
	'POST comments': (id) => [`/api/feed/${id}/comments`, json('POST', { content: 'hello' })],
	'PUT comment': (id, userId) => [`/api/feed/${id}/comments/${commentId(userId)}`, json('PUT', { content: 'edited' })],
	'DELETE comment': (id, userId) => [`/api/feed/${id}/comments/${commentId(userId)}`, { method: 'DELETE' }],
	'POST share': (id) => [`/api/feed/${id}/share`, json('POST', { target: 'profile' })],
};

/** Activity by A and by the caller on every page, so a hidden answer cannot be empty by accident. */
function feedWorld(callerId) {
	const world = teamWorld();
	world.osionos_feed_likes = [];
	world.osionos_feed_reactions = [];
	world.osionos_feed_comments = [];
	world.osionos_feed_shares = [];
	for (const pageId of [IDS.privateA, IDS.sharedA, LIVE_ID]) {
		for (const userId of [IDS.userA, callerId]) {
			world.osionos_feed_likes.push({ page_id: pageId, user_id: userId });
			world.osionos_feed_reactions.push({ page_id: pageId, user_id: userId, emoji: '👍', created_at: '2026-10-01T00:00:00.000Z' });
			world.osionos_feed_shares.push({ id: `${pageId.slice(0, 9)}${userId.slice(9)}`, page_id: pageId, user_id: userId, target: 'profile', created_at: '2026-10-01T00:00:00.000Z' });
		}
		world.osionos_feed_comments.push({ id: `${pageId.slice(0, 8)}${commentId(callerId).slice(8)}`, page_id: pageId, author_id: IDS.userA, content: 'by A', created_at: '2026-10-01T00:00:00.000Z' });
	}
	return world;
}

/** The caller's own comment on `pageId`, whose id commentId(callerId) addresses. */
function withOwnComment(world, pageId, callerId) {
	world.osionos_feed_comments.push({ id: commentId(callerId), page_id: pageId, author_id: callerId, content: 'mine', created_at: '2026-10-01T00:00:00.000Z' });
	return world;
}

const snapshot = (mock) => structuredClone(ACTIVITY.map((table) => mock.rows(table)));
const withoutPageId = ({ pageId, ...rest }) => rest;

describe('feed GETs on a page the caller may not see answer like an id with no activity', () => {
	for (const [viewerName, { userId, home, pageId, hidden }] of Object.entries(VIEWERS)) {
		for (const resource of READS) {
			it(`${viewerName}: GET ${resource}`, async () => {
				const mock = createPostgrestMock(feedWorld(userId));
				const headers = sessionHeaders(config, userId, home);
				await withBridge(config, mock.fetchImpl, async (base) => {
					const answer = await send(base, `/api/feed/${pageId}/${resource}`, headers);
					const untouched = await send(base, `/api/feed/${IDS.missing}/${resource}`, headers);
					assert.equal(answer.status, 200, answer.text);
					if (hidden) assert.deepEqual(withoutPageId(answer.body), withoutPageId(untouched.body));
					else assert.notDeepEqual(withoutPageId(answer.body), withoutPageId(untouched.body));
				});
			});
		}
	}
});

describe('feed writes on a page the caller may not see are a 404 and store nothing', () => {
	for (const [viewerName, { userId, home, pageId, hidden }] of Object.entries(VIEWERS)) {
		for (const [writeName, request] of Object.entries(WRITES)) {
			it(`${viewerName}: ${writeName}`, async () => {
				const mock = createPostgrestMock(withOwnComment(feedWorld(userId), pageId, userId));
				const before = snapshot(mock);
				const [path, init] = request(pageId, userId);
				await withBridge(config, mock.fetchImpl, async (base) => {
					const result = await send(base, path, sessionHeaders(config, userId, home), init);
					if (hidden) {
						assert.equal(result.status, 404, result.text);
						assert.deepEqual(snapshot(mock), before);
					} else {
						assert.ok(result.status < 300, `${result.status} ${result.text}`);
					}
				});
			});
		}
	}
});

describe('profile gallery', () => {
	const asViewer = (userId, home) => sessionHeaders(config, userId, home);
	const cases = [
		['the owner sees every card', asViewer(IDS.userA, IDS.homeA), [IDS.privateA, IDS.sharedA, LIVE_ID]],
		['a member sees readable and live-database cards', asViewer(IDS.userB, IDS.homeB), [IDS.sharedA, LIVE_ID]],
		['a stranger sees only live-database cards', asViewer(STRANGER.userId, STRANGER.home), [LIVE_ID]],
	];
	for (const [name, headers, expected] of cases) {
		it(name, async () => {
			const mock = createPostgrestMock(feedWorld(IDS.userA));
			const before = snapshot(mock);
			await withBridge(config, mock.fetchImpl, async (base) => {
				const gallery = await send(base, `/api/profile/${IDS.userA}/shares`, headers);
				assert.equal(gallery.status, 200, gallery.text);
				assert.deepEqual(gallery.body.shares.map((card) => card.pageId).sort(), [...expected].sort());
				assert.deepEqual(snapshot(mock), before);
			});
		});
	}
});
