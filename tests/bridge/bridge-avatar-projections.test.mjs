/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-avatar-projections.test.mjs                  :::      :::    :::   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P0-6: a `data:` URL never leaves the bridge, and a stored avatar is shown as
// an absolute URL. Every module that projects a user avatar is listed here, so a
// module that skips the projection fails BY NAME.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IDS, harnessConfig } from './support/bridge-harness.mjs';
import { createProfileHandler } from '../../scripts/bridge-profile.mjs';
import { createSocialHandler } from '../../scripts/bridge-social.mjs';
import { identitySummaries } from '../../scripts/bridge-social-core.mjs';
import { createChatHandler } from '../../scripts/bridge-chat.mjs';
import { createCollabHandler } from '../../scripts/bridge-collab.mjs';
import { createCommunityHandler } from '../../scripts/bridge-communities.mjs';
import { createWorkspaceInvitesHandler } from '../../scripts/bridge-workspace-invites.mjs';
import { createFeedHandler } from '../../scripts/bridge-feed.mjs';

const config = { ...harnessConfig(), publicUrl: 'https://bridge.test' };
const CHANNEL = 'c1c1c1c1-1111-4111-8111-c1c1c1c1c1c1';
const COMMUNITY = 'd1d1d1d1-1111-4111-8111-d1d1d1d1d1d1';
const PAGE = 'd1d1d1d1-1111-4111-8111-d1d1d1d1d1d1';
const DATA_AVATAR = 'data:image/png;base64,AAAA';
const STORED_AVATAR = '/api/media/avatars/aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa/abc.webp';
const ABSOLUTE_AVATAR = `https://bridge.test${STORED_AVATAR}`;
const SESSION = { userId: IDS.userA, workspaceIds: [IDS.team], raw: { jti: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa' } };

function json(rows) {
	return { ok: true, status: 200, text: async () => JSON.stringify(rows) };
}

/** The BaaS answers every query the routes below make. */
function stubFetch(avatar) {
	return async (url) => {
		const text = String(url);
		if (text.includes('osionos_people_directory')) {
			const row = (id) => ({ user_id: id, display_name: 'Alice', username: 'alice', profile: { avatar }, last_seen_at: null, directory_opt_out: false });
			return json([row(IDS.userA), row(IDS.userB)]);
		}
		if (text.includes('osionos_bridge_identities')) {
			return json([{ user_id: IDS.userA, display_name: 'Alice', username: 'alice', profile: { avatar }, directory_opt_out: false }]);
		}
		if (text.includes('osionos_profiles')) return json([{ user_id: IDS.userA, display_name: 'Alice', avatar_url: null }]);
		if (text.includes('osionos_user_blocks')) return json([]);
		if (text.includes('osionos_workspace_members')) {
			return json([{ workspace_id: IDS.team, user_id: IDS.userA, role: 'owner', permissions: ['read', 'create', 'update'] }]);
		}
		if (text.includes('osionos_workspaces')) {
			return json([{ id: IDS.team, owner_id: IDS.userA, name: 'Team', slug: 'team', visibility: 'private' }]);
		}
		if (text.includes('osionos_channels')) {
			return json([{ id: CHANNEL, workspace_id: IDS.team, kind: 'text', name: 'General', is_private: false, avatar }]);
		}
		if (text.includes('osionos_channel_members')) return json([{ channel_id: CHANNEL, user_id: IDS.userA, role: 'owner' }]);
		if (text.includes('osionos_community_members')) return json([{ community_id: COMMUNITY, user_id: IDS.userA, role: 'owner' }]);
		if (text.includes('osionos_communities')) {
			return json([{ id: COMMUNITY, name: 'Crew', creator_id: IDS.userA, avatar }]);
		}
		if (text.includes('osionos_messages')) {
			return json([{ id: 'e1e1e1e1-1111-4111-8111-e1e1e1e1e1e1', channel_id: CHANNEL, author_id: IDS.userA, content: 'hello', created_at: '2026-10-01T00:00:00.000Z' }]);
		}
		if (text.includes('osionos_feed_comments')) {
			return json([{ id: 'f1f1f1f1-1111-4111-8111-f1f1f1f1f1f1', page_id: PAGE, author_id: IDS.userA, content: 'hello', created_at: '2026-10-01T00:00:00.000Z' }]);
		}
		if (text.includes('osionos_pages')) return json([]);
		return json([]);
	};
}

/** A response that keeps what the handler wrote. */
function fakeResponse() {
	const written = { status: 0, headers: {}, body: null };
	return {
		written,
		writeHead(status, headers) { written.status = status; written.headers = headers ?? {}; },
		end(body) { written.body = body ? JSON.parse(body) : null; },
	};
}

const request = (method = 'GET', body = null) => ({
	method,
	headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
	...(body ? { body } : {}),
	async *[Symbol.asyncIterator]() { if (body) yield body; },
});

/** One row per module: the route that carries a user avatar and where it lands. */
const MODULES = [
	{
		name: 'bridge-social-core',
		read: async (avatar) => {
			const summaries = await identitySummaries(config, stubFetch(avatar), [IDS.userA]);
			return summaries.get(IDS.userA)?.avatar ?? null;
		},
	},
	{
		name: 'bridge-profile',
		read: async (avatar) => {
			const response = fakeResponse();
			const handler = createProfileHandler({ config, verifySession: () => SESSION, fetchImpl: stubFetch(avatar) });
			await handler(new URL(`http://h/api/profile/${IDS.userA}`), request(), response, config);
			return response.written.body?.avatar ?? null;
		},
	},
	{
		name: 'bridge-social',
		read: async (avatar) => {
			const response = fakeResponse();
			const handler = createSocialHandler({ config, verifySession: () => SESSION, fetchImpl: stubFetch(avatar) });
			await handler(new URL('http://h/api/directory/search'), request(), response, config);
			return response.written.body?.people?.[0]?.avatar ?? null;
		},
	},
	{
		name: 'bridge-chat',
		read: async (avatar) => {
			const response = fakeResponse();
			const handler = createChatHandler({ config, verifySession: () => SESSION, fetchImpl: stubFetch(avatar) });
			await handler(new URL(`http://h/api/chat/channels/${CHANNEL}/messages`), request(), response, config);
			return response.written.body?.messages?.[0]?.authorAvatar ?? null;
		},
	},
	{
		name: 'bridge-collab',
		read: async (avatar) => {
			const response = fakeResponse();
			const handler = createCollabHandler({ config, verifySession: () => SESSION, fetchImpl: stubFetch(avatar) });
			await handler(new URL(`http://h/api/workspaces/${IDS.team}/members`), request(), response, config);
			return response.written.body?.members?.[0]?.avatar ?? null;
		},
	},
	{
		name: 'bridge-workspace-invites',
		read: async (avatar) => {
			const response = fakeResponse();
			const handler = createWorkspaceInvitesHandler({ config, verifySession: () => SESSION, fetchImpl: stubFetch(avatar) });
			await handler(new URL(`http://h/api/workspaces/${IDS.team}/members/${IDS.userB}`), request('PATCH', JSON.stringify({ role: 'member' })), response, config);
			return response.written.body?.member?.avatar ?? null;
		},
	},
	{
		name: 'bridge-feed',
		read: async (avatar) => {
			const response = fakeResponse();
			const handler = createFeedHandler({ config, verifySession: () => SESSION, fetchImpl: stubFetch(avatar) });
			await handler(new URL(`http://h/api/feed/${PAGE}/comments`), request(), response, config);
			return response.written.body?.comments?.[0]?.authorAvatar ?? null;
		},
	},
	{
		name: 'bridge-chat channel',
		read: async (avatar) => {
			const response = fakeResponse();
			const handler = createChatHandler({ config, verifySession: () => SESSION, fetchImpl: stubFetch(avatar) });
			await handler(new URL('http://h/api/chat/channels'), request(), response, config);
			return response.written.body?.channels?.[0]?.avatar ?? null;
		},
	},
	{
		name: 'bridge-communities',
		read: async (avatar) => {
			const response = fakeResponse();
			const handler = createCommunityHandler({ config, verifySession: () => SESSION, fetchImpl: stubFetch(avatar) });
			await handler(new URL('http://h/api/communities'), request(), response, config);
			return response.written.body?.communities?.[0]?.avatar ?? null;
		},
	},
];

describe('every user-avatar projection goes through the one helper', () => {
	for (const module of MODULES) {
		it(`${module.name}: a data: avatar is no avatar`, async () => {
			assert.equal(await module.read(DATA_AVATAR), null);
		});

		it(`${module.name}: a javascript: avatar is no avatar`, async () => {
			assert.equal(await module.read('javascript:alert(1)'), null);
		});

		it(`${module.name}: an http: avatar is no avatar`, async () => {
			assert.equal(await module.read('http://example.com/a.png'), null);
		});

		it(`${module.name}: a stored avatar is an absolute URL`, async () => {
			assert.equal(await module.read(STORED_AVATAR), ABSOLUTE_AVATAR);
		});
	}
});

describe('the channel and community avatar keeps the icon value', () => {
	for (const module of MODULES.filter((entry) => entry.name === 'bridge-chat channel' || entry.name === 'bridge-communities')) {
		it(`${module.name}: an emoji avatar is kept`, async () => {
			assert.equal(await module.read('🎉'), '🎉');
		});

		it(`${module.name}: a lucide icon is kept`, async () => {
			assert.equal(await module.read('icon:rocket'), 'icon:rocket');
		});
	}
});
