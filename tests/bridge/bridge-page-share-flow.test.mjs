/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-share-flow.test.mjs                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/15 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Share dialog writes a page's `collaborators` and `visibility` through the owner-only
// PATCH /api/pages/:id, the same fields the read rule enforces. A sharee must be a member of
// the page's workspace (the read path requires it), so the PATCH refuses anyone else.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, patch, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asA = sessionHeaders(config, IDS.userA, IDS.homeA);
const asB = sessionHeaders(config, IDS.userB, IDS.homeB);
const OUTSIDER = 'e5e5e5e5-5555-4555-8555-e5e5e5e5e5e5';

describe('share with a member, then revoke', () => {
	it('lets the sharee open the private page once listed, and not after', async () => {
		const mock = createPostgrestMock(teamWorld({ memberRole: 'viewer' }));
		await withBridge(config, mock.fetchImpl, async (base) => {
			assert.equal((await send(base, `/api/pages/${IDS.privateA}`, asB)).status, 404);
			const shared = await send(base, `/api/pages/${IDS.privateA}`, asA, patch({ collaborators: [{ userId: IDS.userB, role: 'viewer' }] }));
			assert.equal(shared.status, 200, shared.text);
			const opened = await send(base, `/api/pages/${IDS.privateA}`, asB);
			assert.equal(opened.status, 200, opened.text);
			assert.equal(opened.body.title, 'A private plan');
			const revoked = await send(base, `/api/pages/${IDS.privateA}`, asA, patch({ collaborators: [] }));
			assert.equal(revoked.status, 200, revoked.text);
			// An unreadable page answers like a missing one, so a revoked sharee learns nothing.
			const after = await send(base, `/api/pages/${IDS.privateA}`, asB);
			const missing = await send(base, `/api/pages/${IDS.missing}`, asB);
			assert.deepEqual([after.status, after.body], [missing.status, missing.body]);
		});
	});

	it('shares with the whole workspace through visibility, and takes it back', async () => {
		const mock = createPostgrestMock(teamWorld({ memberRole: 'viewer' }));
		await withBridge(config, mock.fetchImpl, async (base) => {
			assert.equal((await send(base, `/api/pages/${IDS.privateA}`, asA, patch({ visibility: 'shared' }))).status, 200);
			assert.equal((await send(base, `/api/pages/${IDS.privateA}`, asB)).status, 200);
			assert.equal((await send(base, `/api/pages/${IDS.privateA}`, asA, patch({ visibility: 'private' }))).status, 200);
			assert.equal((await send(base, `/api/pages/${IDS.privateA}`, asB)).status, 404);
		});
	});
});

describe('who a page can be shared with', () => {
	it('refuses a user who is not a member of the page\'s workspace, says so, and changes nothing', async () => {
		const mock = createPostgrestMock(teamWorld());
		const before = structuredClone(mock.page(IDS.privateA));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const result = await send(base, `/api/pages/${IDS.privateA}`, asA, patch({ collaborators: [{ userId: OUTSIDER, role: 'viewer' }] }));
			assert.equal(result.status, 422, result.text);
			assert.match(result.body.message, /not a member of this page's workspace/);
			assert.deepEqual(mock.page(IDS.privateA), before);
		});
	});

	it('checks membership in the workspace the same PATCH moves the page to', async () => {
		const mock = createPostgrestMock(teamWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const result = await send(base, `/api/pages/${IDS.privateA}`, asA, patch({ workspaceId: IDS.homeA, collaborators: [{ userId: IDS.userB, role: 'viewer' }] }));
			assert.equal(result.status, 422, result.text);
			assert.equal(mock.page(IDS.privateA).workspace_id, IDS.team);
		});
	});

	for (const [label, entry] of [['a role it does not know', { userId: IDS.userB, role: 'admin' }], ['no role', { userId: IDS.userB }], ['a userId that is not a uuid', { userId: 'bob', role: 'viewer' }]]) {
		it(`refuses a collaborator with ${label}`, async () => {
			const mock = createPostgrestMock(teamWorld());
			await withBridge(config, mock.fetchImpl, async (base) => {
				const result = await send(base, `/api/pages/${IDS.privateA}`, asA, patch({ collaborators: [entry] }));
				assert.equal(result.status, 422, result.text);
				assert.deepEqual(mock.page(IDS.privateA).collaborators, []);
			});
		});
	}

	it('keeps a collaborator already on the page without re-checking them, so an older share does not block an edit', async () => {
		const world = teamWorld();
		world.osionos_pages.find((row) => row.id === IDS.privateA).collaborators = [{ userId: OUTSIDER, role: 'viewer' }];
		const mock = createPostgrestMock(world);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const kept = [{ userId: OUTSIDER, role: 'viewer' }, { userId: IDS.userB, role: 'editor' }];
			const result = await send(base, `/api/pages/${IDS.privateA}`, asA, patch({ collaborators: kept }));
			assert.equal(result.status, 200, result.text);
			assert.deepEqual(mock.page(IDS.privateA).collaborators, kept);
		});
	});

	it('does not query membership when a PATCH carries no new collaborator', async () => {
		const mock = createPostgrestMock(teamWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			assert.equal((await send(base, `/api/pages/${IDS.privateA}`, asA, patch({ title: 'Renamed', collaborators: [] }))).status, 200);
		});
		assert.equal(mock.calls.filter((call) => call.table === 'osionos_workspace_members' && call.params.has('user_id') && call.params.get('user_id').startsWith('in.')).length, 0);
	});
});
