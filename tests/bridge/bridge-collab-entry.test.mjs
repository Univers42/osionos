/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-collab-entry.test.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A collaboration preview (GET /api/collaboration/:id) and a join request (POST
// /api/collaboration/:id/join) exist only for discoverable workspaces (an allowlist, so a
// new visibility value stays hidden), and a non-member previews only a public entry page
// — a page shared with the workspace stays inside it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, post, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asA = sessionHeaders(config, IDS.userA, IDS.homeA);
const asB = sessionHeaders(config, IDS.userB, IDS.homeB);
const ENTRY = 'a8a8a8a8-1111-4111-8111-a8a8a8a8a8a8';
const INSIDE = 'shared with members only';

function collabWorld(workspaceVisibility, pageVisibility) {
	return {
		osionos_workspaces: [{ id: IDS.team, owner_id: IDS.userA, name: 'Team', slug: 'team', visibility: workspaceVisibility }],
		osionos_workspace_members: [{ workspace_id: IDS.team, user_id: IDS.userA, role: 'owner', permissions: ['read'] }],
		osionos_pages: [{
			id: ENTRY, workspace_id: IDS.team, owner_id: IDS.userA, visibility: pageVisibility, title: 'Welcome', icon: null, cover: null,
			content: [{ id: 'e1', type: 'paragraph', content: INSIDE }], created_at: '2026-10-01T00:00:00.000Z',
		}],
	};
}

async function preview(world, headers) {
	const mock = createPostgrestMock(world);
	return withBridge(config, mock.fetchImpl, (base) => send(base, `/api/collaboration/${IDS.team}`, headers));
}

describe('collaboration preview', () => {
	it('gives a non-member no entry page when the only page is shared with the workspace', async () => {
		const result = await preview(collabWorld('request_to_join', 'shared'), asB);
		assert.equal(result.status, 200, result.text);
		assert.equal(result.body.entryPage, null);
		assert.equal(result.text.includes(INSIDE), false);
	});

	it('gives a non-member a public entry page', async () => {
		const result = await preview(collabWorld('request_to_join', 'public'), asB);
		assert.equal(result.status, 200, result.text);
		assert.equal(result.body.entryPage?.id, ENTRY);
	});

	it('gives a member the shared entry page', async () => {
		const result = await preview(collabWorld('request_to_join', 'shared'), asA);
		assert.equal(result.status, 200, result.text);
		assert.equal(result.body.entryPage?.id, ENTRY);
	});

	for (const visibility of ['confidential', null, 'unlisted']) {
		it(`404s a workspace whose visibility is ${visibility}`, async () => {
			const result = await preview(collabWorld(visibility, 'public'), asB);
			assert.equal(result.status, 404, result.text);
		});
	}
});

describe('joining a collaboration', () => {
	async function join(visibility) {
		const mock = createPostgrestMock(collabWorld(visibility, 'public'));
		return withBridge(config, mock.fetchImpl, async (base) => {
			const joined = await send(base, `/api/collaboration/${IDS.team}/join`, asB, post({ message: 'hello' }));
			const missing = await send(base, `/api/collaboration/${IDS.missing}/join`, asB, post({ message: 'hello' }));
			const writes = mock.calls.filter((call) => call.method !== 'GET');
			return { joined, missing, writes, outbound: mock.outbound };
		});
	}

	for (const visibility of [null, 'bogus']) {
		it(`answers a workspace whose visibility is ${visibility} like a missing one, writing and publishing nothing`, async () => {
			const { joined, missing, writes, outbound } = await join(visibility);
			assert.equal(joined.status, 404, joined.text);
			assert.deepEqual([joined.status, joined.body], [missing.status, missing.body]);
			assert.deepEqual([writes, outbound], [[], []]);
		});
	}

	it('records a join request and notifies the owner for a request_to_join workspace', async () => {
		const { joined, writes, outbound } = await join('request_to_join');
		assert.equal(joined.status, 202, joined.text);
		assert.deepEqual(writes.map((call) => call.table), ['osionos_join_requests']);
		assert.equal(outbound.length, 1);
		assert.match(outbound[0], /\/v1\/publish$/);
	});
});
