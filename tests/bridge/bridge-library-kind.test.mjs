/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-library-kind.test.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Library files a page under Docs, Rules or Hooks with a `library-kind` select in
// the page's `properties`. No access decision reads `properties`
// (scripts/bridge-access-generation.mjs:41-42; mayModifyPage and canReadPageRow read
// owner, visibility, collaborators and membership only), so the Kind is display-only:
// setting it changes who may read the page for nobody, and a viewer still cannot set it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canReadPageRow } from '../../scripts/bridge-page-read.mjs';
import { IDS, createPostgrestMock, harnessConfig, patch, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asB = sessionHeaders(config, IDS.userB, IDS.homeB, [IDS.team]);
const STRANGER = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';
const READERS = [IDS.userA, IDS.userB, STRANGER];
const KIND = { key: 'library-kind', label: 'Kind', type: 'select', value: 'Hook', options: ['Doc', 'Rule', 'Hook'] };

function world(memberRole) {
	const seeded = teamWorld({ memberRole });
	// realWorkspaceRpc answers [] for a caller with no home row; B always has one.
	seeded.osionos_workspace_members.push({ workspace_id: IDS.homeB, user_id: IDS.userB, role: 'owner', permissions: ['create', 'read', 'update', 'delete', 'admin'] });
	return seeded;
}

const readers = (row) => READERS.map((userId) => canReadPageRow(row, userId));

async function patchKind(memberRole, pageId) {
	const mock = createPostgrestMock(world(memberRole), { realWorkspaceRpc: true });
	const before = structuredClone(mock.page(pageId));
	const response = await withBridge(config, mock.fetchImpl, (base) =>
		send(base, `/api/pages/${pageId}`, asB, patch({ properties: [KIND] })));
	return { status: response.status, before, after: mock.page(pageId) };
}

describe('C836: a Library Kind is display-only', () => {
	it('an editor sets the Kind and nobody gains or loses the read', async () => {
		for (const pageId of [IDS.sharedA, IDS.pageB]) {
			const { status, before, after } = await patchKind('editor', pageId);
			assert.equal(status, 200, `the editor's patch of ${pageId} applies`);
			assert.deepEqual(after.properties, [KIND]);
			assert.deepEqual(readers(after), readers(before), `who reads ${pageId} is unchanged`);
			for (const column of ['owner_id', 'visibility', 'collaborators', 'workspace_id']) {
				assert.deepEqual(after[column], before[column], `${column} of ${pageId} is untouched`);
			}
		}
	});

	it('a viewer patching the Kind is refused and the row is unchanged', async () => {
		const { status, before, after } = await patchKind('viewer', IDS.sharedA);
		assert.equal(status, 403);
		assert.deepEqual(after, before);
	});
});
