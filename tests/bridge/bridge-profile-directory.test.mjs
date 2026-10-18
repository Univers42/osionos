/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-profile-directory.test.mjs                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// G6 F5: GET /api/profile/:userId honours the same directory opt-out and block rules as
// the people search, so addressing a user by id is not a way around them.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asA = sessionHeaders(config, IDS.userA, IDS.homeA);
const asB = sessionHeaders(config, IDS.userB, IDS.homeB);
const PRIVATE_FIELDS = ['bio', 'location', 'headline', 'customFields', 'workspaceId', 'role', 'online', 'lastSeenAt', 'username', 'joinedAt'];

function world({ optedOut = false, blocks = [] } = {}) {
	const mock = createPostgrestMock({
		osionos_bridge_identities: [{
			user_id: IDS.userA, display_name: 'Alice', username: 'alice', directory_opt_out: optedOut,
			profile: { avatar: 'data:image/png;base64,AAAA', bio: 'private bio', headline: 'CTO', location: 'Paris', fields: { phone: '555' } },
			created_at: '2026-10-01T00:00:00.000Z', last_seen_at: new Date().toISOString(),
		}],
		osionos_workspace_members: [{ workspace_id: IDS.team, user_id: IDS.userA, role: 'owner', permissions: ['read'] }],
	}, {
		// The mock has no `or=` filter; the block lookup is answered directly.
		failWhen: (call) => (call.table === 'osionos_user_blocks' ? { status: 200, body: blocks } : null),
	});
	return mock.fetchImpl;
}

const profileOf = (base, headers) => send(base, `/api/profile/${IDS.userA}`, headers);

describe('GET /api/profile/:userId', () => {
	it('answers an opted-out user to another viewer with the minimal card only', async () => {
		await withBridge(config, world({ optedOut: true }), async (base) => {
			const { status, body } = await profileOf(base, asB);
			assert.equal(status, 200);
			assert.deepEqual(body, { ok: true, userId: IDS.userA, name: 'Alice', avatar: 'data:image/png;base64,AAAA' });
			for (const field of PRIVATE_FIELDS) assert.ok(!(field in body), field);
		});
	});

	it('answers a viewer who blocked or was blocked by the user with the minimal card only', async () => {
		const blocks = [{ blocker_id: IDS.userA, blocked_id: IDS.userB }];
		await withBridge(config, world({ blocks }), async (base) => {
			const { body } = await profileOf(base, asB);
			assert.deepEqual(Object.keys(body).sort(), ['avatar', 'name', 'ok', 'userId']);
		});
	});

	it('shows an opted-out user their own full profile', async () => {
		await withBridge(config, world({ optedOut: true }), async (base) => {
			const { body } = await profileOf(base, asA);
			assert.equal(body.bio, 'private bio');
			assert.deepEqual(body.customFields, { phone: '555' });
		});
	});

	it('still shows the full profile of a user who is in the directory', async () => {
		await withBridge(config, world(), async (base) => {
			const { body } = await profileOf(base, asB);
			assert.equal(body.headline, 'CTO');
			assert.equal(body.workspaceId, IDS.team);
		});
	});

	it('cannot be walked around by upper-casing the id', async () => {
		const blocks = [{ blocker_id: IDS.userA, blocked_id: IDS.userB }];
		await withBridge(config, world({ blocks }), async (base) => {
			const lower = await profileOf(base, asB);
			const upper = await send(base, `/api/profile/${IDS.userA.toUpperCase()}`, asB);
			assert.deepEqual(Object.keys(upper.body).sort(), ['avatar', 'name', 'ok', 'userId']);
			assert.deepEqual(upper.body, lower.body);
		});
	});
});
