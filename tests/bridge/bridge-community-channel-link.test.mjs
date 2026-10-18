/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-community-channel-link.test.mjs             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// G6 F4: linking a channel into a community publishes its id, workspace, kind, name and
// topic to every community member, so the linker must be able to reach that channel.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, post, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asB = sessionHeaders(config, IDS.userB, IDS.homeB);
const COMMUNITY = '44444444-bbbb-4bbb-8bbb-444444444444';
const PRIVATE_OF_A = '55555555-bbbb-4bbb-8bbb-555555555555';
const PUBLIC_CHANNEL = '66666666-bbbb-4bbb-8bbb-666666666666';

function world() {
	return createPostgrestMock({
		osionos_channels: [
			{ id: PRIVATE_OF_A, workspace_id: IDS.team, kind: 'text', is_private: true, name: 'a-secret' },
			{ id: PUBLIC_CHANNEL, workspace_id: IDS.team, kind: 'text', is_private: false, name: 'general' },
		],
		osionos_channel_members: [{ channel_id: PRIVATE_OF_A, user_id: IDS.userA, role: 'owner' }],
		osionos_workspace_members: [{ workspace_id: IDS.team, user_id: IDS.userB, role: 'member', permissions: ['read'] }],
		osionos_communities: [{ id: COMMUNITY, name: 'B community', creator_id: IDS.userB }],
		osionos_community_members: [{ community_id: COMMUNITY, user_id: IDS.userB, role: 'owner' }],
	});
}

describe('POST /api/communities/:id/channels', () => {
	it('refuses a community owner linking a private channel they are not in, and links nothing', async () => {
		const mock = world();
		await withBridge(config, mock.fetchImpl, async (base) => {
			const denied = await send(base, `/api/communities/${COMMUNITY}/channels`, asB, post({ channelId: PRIVATE_OF_A }));
			assert.equal(denied.status, 403, denied.text);
			assert.deepEqual(mock.rows('osionos_community_channels'), []);
		});
	});

	it('links a channel the caller can reach', async () => {
		const mock = world();
		await withBridge(config, mock.fetchImpl, async (base) => {
			const linked = await send(base, `/api/communities/${COMMUNITY}/channels`, asB, post({ channelId: PUBLIC_CHANNEL }));
			assert.equal(linked.status, 200, linked.text);
			assert.equal(mock.rows('osionos_community_channels').length, 1);
		});
	});
});
