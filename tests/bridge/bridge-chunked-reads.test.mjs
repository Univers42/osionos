/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-chunked-reads.test.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The id lists that used to travel whole: they are read in chunks of 50, at most four
// requests in flight, and the merged answer keeps every row.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';
import { createSocialStub, getConnections, uid } from './support/social-postgrest.mjs';

const config = harnessConfig();
const ME = uid(1);

/** The ids of an `in.(…)` filter of the bridge: they are quoted, so the quotes come off. */
function idsOf(expr) {
	const match = /^in\.\((.*)\)$/.exec(String(expr ?? ''));
	if (!match) return [];
	return match[1].split(',').map((id) => id.replace(/^"(.*)"$/, '$1')).filter(Boolean);
}

describe('the connections list reads its peers in chunks', () => {
	it('500 peers are 10 reads of at most 50 ids, at most 4 in flight', async () => {
		const peers = Array.from({ length: 500 }, (_, index) => uid(1000 + index));
		const world = {
			blocks: [],
			people: peers.map((user_id) => ({ user_id, display_name: 'Peer', profile: {} })),
			connections: peers.map((peer, index) => ({
				id: uid(500 + index),
				requester_id: ME,
				addressee_id: peer,
				status: 'accepted',
				source: 'manual',
				intro_message: null,
				created_at: new Date(Date.UTC(2026, 9, 1, 0, 0, index)).toISOString(),
				responded_at: null,
			})),
		};
		const stub = createSocialStub(world);
		let inFlight = 0;
		let peak = 0;
		const answered = stub.fetchImpl;
		stub.fetchImpl = async (url, init) => {
			inFlight += 1;
			peak = Math.max(peak, inFlight);
			try {
				await new Promise((resolve) => setTimeout(resolve, 2));
				return await answered(url, init);
			} finally {
				inFlight -= 1;
			}
		};
		const result = await getConnections(stub, ME);
		assert.equal(result.status, 200);
		const reads = stub.calls.filter((call) => call.table === 'osionos_people_directory');
		assert.equal(reads.length, 10);
		for (const read of reads) assert.ok(idsOf(read.query.match(/user_id=([^&]+)/)[1]).length <= 50);
		assert.ok(peak <= 4, `peak in flight was ${peak}`);
		assert.ok(peak > 1, 'the reads really overlapped');
		assert.equal(result.body.connections.length, 500);
		const ids = result.body.connections.map((row) => row.peer.id);
		assert.equal(new Set(ids).size, 500);
		// The order is the order of the stored edges, newest first.
		const stored = world.connections.map((row) => row.addressee_id).reverse();
		assert.deepEqual(ids, stored);
	});
});

describe('the profile gallery reads its pages in chunks', () => {
	it('60 shared pages are 2 reads of at most 50 ids, newest share first', async () => {
		// The shares are read newest first; the pages that answer them come from two chunks.
		const shares = Array.from({ length: 60 }, (_, index) => ({
			id: `f${String(index).padStart(3, '0')}`,
			page_id: `${String(index).padStart(8, '0')}-0000-4000-8000-000000000000`,
			user_id: IDS.userA,
			target: 'profile',
			created_at: new Date(Date.UTC(2026, 9, 1, 0, 0, 59 - index)).toISOString(),
		}));
		const world = {
			osionos_feed_shares: shares,
			osionos_pages: shares.map((share) => ({
				id: share.page_id,
				workspace_id: IDS.team,
				owner_id: IDS.userA,
				visibility: 'shared',
				collaborators: [],
				title: `Page ${share.page_id}`,
			})),
			osionos_workspace_members: [{ workspace_id: IDS.team, user_id: IDS.userB, role: 'member', permissions: ['read'] }],
		};
		const mock = createPostgrestMock(world);
		const headers = sessionHeaders(config, IDS.userB, IDS.homeB);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, `/api/profile/${IDS.userA}/shares`, headers);
			assert.equal(answer.status, 200, answer.text);
			assert.equal(answer.body.shares.length, 60);
			// The cards keep the order of the shares they come from, newest first.
			assert.deepEqual(answer.body.shares.map((card) => card.pageId), shares.map((share) => share.page_id));
		});
		const reads = mock.calls.filter((call) => call.table === 'osionos_pages');
		assert.equal(reads.length, 2);
		for (const read of reads) assert.ok(idsOf(read.params.get('id')).length <= 50);
	});
});

describe('the channel list reads its channels in chunks', () => {
	it('120 member channels are 3 reads of at most 50 ids', async () => {
		const channels = Array.from({ length: 120 }, (_, index) => ({
			id: `${String(index).padStart(8, '0')}-0000-4000-8000-000000000000`,
			workspace_id: IDS.team,
			kind: 'text',
			name: `Channel ${index}`,
			is_private: false,
			created_at: new Date(Date.UTC(2026, 9, 1, 0, 0, index)).toISOString(),
		}));
		const world = {
			osionos_channels: channels,
			osionos_channel_members: channels.map((channel) => ({ channel_id: channel.id, user_id: IDS.userB, role: 'member' })),
			osionos_workspace_members: [{ workspace_id: IDS.team, user_id: IDS.userB, role: 'member', permissions: ['read'] }],
		};
		const mock = createPostgrestMock(world);
		const headers = sessionHeaders(config, IDS.userB, IDS.homeB);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/chat/channels', headers);
			assert.equal(answer.status, 200, answer.text);
			assert.equal(answer.body.channels.length, 120);
			assert.deepEqual(answer.body.channels.map((row) => row.id), channels.map((row) => row.id));
		});
		const reads = mock.calls.filter((call) => call.table === 'osionos_channels');
		// Three chunks of member channels, one read of the public channels of the workspace.
		assert.equal(reads.length, 4);
		assert.equal(reads.filter((read) => read.params.get('id')).length, 3);
		for (const read of reads) {
			const ids = idsOf(read.params.get('id') ?? read.params.get('workspace_id'));
			assert.ok(ids.length <= 50);
		}
	});
});

describe('a chunk that fails', () => {
	it('fails the whole read: no partial answer', async () => {
		const peers = Array.from({ length: 120 }, (_, index) => uid(1000 + index));
		const world = {
			blocks: [],
			people: peers.map((user_id) => ({ user_id, display_name: 'Peer', profile: {} })),
			connections: peers.map((peer, index) => ({
				id: uid(500 + index),
				requester_id: ME,
				addressee_id: peer,
				status: 'accepted',
				source: 'manual',
				intro_message: null,
				created_at: new Date(Date.UTC(2026, 9, 1, 0, 0, index)).toISOString(),
				responded_at: null,
			})),
		};
		const stub = createSocialStub(world);
		const answered = stub.fetchImpl;
		let seen = 0;
		stub.fetchImpl = async (url, init) => {
			if (String(url).includes('osionos_people_directory')) {
				seen += 1;
				if (seen === 2) return new Response('{"message":"stub failure"}', { status: 500, headers: { 'content-type': 'application/json' } });
			}
			return answered(url, init);
		};
		const result = await getConnections(stub, ME);
		assert.equal(result.status, 502);
		assert.equal(result.body.connections, undefined);
	});
});
