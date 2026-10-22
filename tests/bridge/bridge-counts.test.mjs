/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-counts.test.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The counts: the unread notifications are one request that asks for the total, and the
// engagement numbers of a post are one call to the counts function.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countFromRange, restCount } from '../../scripts/bridge-social-core.mjs';
import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const PAGE = '99999999-9999-4999-8999-999999999999';
const asB = sessionHeaders(config, IDS.userB, IDS.homeB);

describe('countFromRange', () => {
	it('reads the total of a Content-Range header', () => {
		assert.equal(countFromRange('*/0'), 0);
		assert.equal(countFromRange('0-0/17'), 17);
		assert.equal(countFromRange(' 0-0/17 '), 17);
	});

	it('refuses a header that carries no count', () => {
		assert.equal(countFromRange('*/*'), null);
		assert.equal(countFromRange(''), null);
		assert.equal(countFromRange(null), null);
		assert.equal(countFromRange('0-0/'), null);
		assert.equal(countFromRange('0-0/x'), null);
	});
});

describe('restCount', () => {
	it('asks for the count and answers the total', async () => {
		const seen = [];
		const fetchImpl = async (url, init) => {
			seen.push({ url: String(url), headers: init.headers });
			return new Response('[]', { status: 200, headers: { 'content-range': '0-0/17' } });
		};
		const total = await restCount({ baasUrl: 'http://baas.test', serviceKey: 'svc' }, fetchImpl, 'osionos_notifications?user_id=eq.1');
		assert.equal(total, 17);
		assert.equal(seen[0].headers.Prefer, 'count=exact');
		assert.equal(seen[0].headers.Range, '0-0');
	});

	it('a missing or malformed header is a 502, never a zero', async () => {
		const answer = async (headers) => new Response('[]', { status: 200, headers });
		const config2 = { baasUrl: 'http://baas.test', serviceKey: 'svc' };
		await assert.rejects(restCount(config2, async () => answer({}), 't'), (error) => error.status === 502);
		await assert.rejects(restCount(config2, async () => answer({ 'content-range': '*/*' }), 't'), (error) => error.status === 502);
	});
});

describe('the notification inbox', () => {
	it('the unread count is one request that asks for the total', async () => {
		const world = {
			osionos_bridge_identities: [{ user_id: IDS.userB, notify_token: 'notify-token-b' }],
			osionos_notifications: [
				{ id: 'n1', user_id: IDS.userB, read_at: null },
				{ id: 'n2', user_id: IDS.userB, read_at: null },
				{ id: 'n3', user_id: IDS.userB, read_at: '2026-10-22T00:00:00.000Z' },
			],
		};
		const mock = createPostgrestMock(world);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/notifications/inbox', asB);
			assert.equal(answer.status, 200, answer.text);
			assert.equal(answer.body.unread, 2);
			assert.equal(answer.body.notifyToken, 'notify-token-b');
		});
		const counted = mock.calls.filter((call) => call.prefer === 'count=exact');
		assert.equal(counted.length, 1);
		assert.equal(counted[0].table, 'osionos_notifications');
		assert.equal(counted[0].headers.Range, '0-0');
	});
});

describe('the feed counts', () => {
	const world = () => ({
		osionos_pages: [{ id: PAGE, workspace_id: IDS.team, owner_id: IDS.userA, visibility: 'shared', collaborators: [] }],
		osionos_workspace_members: [{ workspace_id: IDS.team, user_id: IDS.userB, role: 'member', permissions: ['read'] }],
		osionos_feed_likes: [{ page_id: PAGE, user_id: IDS.userA }, { page_id: PAGE, user_id: IDS.userB }],
		osionos_feed_comments: [{ id: 'c1', page_id: PAGE, author_id: IDS.userA, content: 'hi', created_at: '2026-10-22T00:00:00.000Z' }],
		osionos_feed_shares: [{ id: 's1', page_id: PAGE, user_id: IDS.userA, target: 'profile', created_at: '2026-10-22T00:00:00.000Z' }],
	});

	it('the likes of a post are one call to the counts function', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, `/api/feed/${PAGE}/likes`, asB);
			assert.equal(answer.status, 200, answer.text);
			assert.deepEqual(answer.body, { ok: true, pageId: PAGE, count: 2, likedByMe: true });
		});
		const calls = mock.calls.filter((call) => call.table === 'rpc/osionos_feed_page_counts');
		assert.equal(calls.length, 1);
		assert.deepEqual(calls[0].body, { p_page_id: PAGE, p_viewer: IDS.userB });
		assert.equal(mock.calls.filter((call) => call.table === 'osionos_feed_likes').length, 0);
	});

	it('the share count of a post is one call to the counts function', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, `/api/feed/${PAGE}/share`, asB);
			assert.equal(answer.status, 200, answer.text);
			assert.deepEqual(answer.body, { count: 1 });
		});
		assert.equal(mock.calls.filter((call) => call.table === 'rpc/osionos_feed_page_counts').length, 1);
		assert.equal(mock.calls.filter((call) => call.table === 'osionos_feed_shares').length, 0);
	});

	it('a counts function that is not deployed is a 503 with a stable code', async () => {
		const mock = createPostgrestMock(world(), {
			failWhen: (call) => (call.table === 'rpc/osionos_feed_page_counts' ? { status: 404, body: { message: 'not found' } } : null),
		});
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, `/api/feed/${PAGE}/likes`, asB);
			assert.equal(answer.status, 503, answer.text);
			assert.equal(answer.body.code, 'feed_counts_unavailable');
		});
	});
});
