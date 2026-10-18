/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-rtc-channel-access.test.mjs                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// G6 F2: a call token is a channel grant. A workspace member who is not in a private
// channel or DM gets no token for it; public channels stay open to the workspace.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig } from './support/bridge-harness.mjs';
import { authorizeRtcJoin } from '../../scripts/bridge-rtc.mjs';

const config = harnessConfig();
const PRIVATE_CHANNEL = '11111111-aaaa-4aaa-8aaa-111111111111';
const DM_CHANNEL = '22222222-aaaa-4aaa-8aaa-222222222222';
const PUBLIC_CHANNEL = '33333333-aaaa-4aaa-8aaa-333333333333';

function world() {
	return createPostgrestMock({
		osionos_channels: [
			{ id: PRIVATE_CHANNEL, workspace_id: IDS.team, kind: 'text', is_private: true },
			{ id: DM_CHANNEL, workspace_id: IDS.team, kind: 'dm', is_private: false },
			{ id: PUBLIC_CHANNEL, workspace_id: IDS.team, kind: 'text', is_private: false },
		],
		osionos_workspace_members: [
			{ workspace_id: IDS.team, user_id: IDS.userA, role: 'owner', permissions: ['read'] },
			{ workspace_id: IDS.team, user_id: IDS.userB, role: 'member', permissions: ['read'] },
		],
		osionos_channel_members: [
			{ channel_id: PRIVATE_CHANNEL, user_id: IDS.userA, role: 'owner' },
			{ channel_id: DM_CHANNEL, user_id: IDS.userA, role: 'member' },
		],
	});
}

const join = (mock, userId, channelId) => authorizeRtcJoin({ userId, channelId, workspaceId: IDS.team, config, fetchImpl: mock.fetchImpl });
const refused = (status) => (error) => error.status === status;

describe('authorizeRtcJoin checks the channel, not only its workspace', () => {
	for (const [name, channelId] of [['private channel', PRIVATE_CHANNEL], ['DM', DM_CHANNEL]]) {
		it(`refuses a workspace member who is not in the ${name}`, async () => {
			await assert.rejects(join(world(), IDS.userB, channelId), refused(403));
		});

		it(`admits a member of the ${name}`, async () => {
			assert.equal((await join(world(), IDS.userA, channelId)).workspaceId, IDS.team);
		});
	}

	it('admits any workspace member to a public channel', async () => {
		assert.equal((await join(world(), IDS.userB, PUBLIC_CHANNEL)).workspaceId, IDS.team);
	});
});
