import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

/**
 * #261: "Mentions" of a page named `Sales` listed shell scripts and Spanish
 * clinic notes from the owner's other workspaces. A title is usually a common
 * word, so an unlinked mention only means something inside the page's own
 * workspace; the search must not ask the other workspaces at all.
 */
const config = harnessConfig();
const PROBE = '33333333-3333-4333-8333-333333333333';

function page(id, workspaceId) {
	return {
		id, workspace_id: workspaceId, owner_id: IDS.userA, visibility: 'shared', title: 'Sales',
		collaborators: [], properties: [], parent_page_id: null, archived_at: null, content: [],
		created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
	};
}

describe('unlinked mentions stay in the page\'s workspace', () => {
	it('searches only the workspace of the page, not every readable workspace', async () => {
		const world = teamWorld();
		world.osionos_pages = [page(PROBE, IDS.team)];
		world.osionos_page_links = [];
		const mock = createPostgrestMock(world);
		const searched = [];
		const fetchImpl = (url, init) => {
			const text = String(url);
			if (text.includes('search_doc=wfts')) searched.push(decodeURIComponent(text));
			return mock.fetchImpl(url, init);
		};
		await withBridge(config, fetchImpl, async (base) => {
			const headers = sessionHeaders(config, IDS.userA, IDS.homeA, [IDS.team, IDS.homeA]);
			const answer = await send(base, `/api/pages/${PROBE}/backlinks`, headers);
			assert.equal(answer.status, 200, answer.text);
		});
		assert.ok(searched.length > 0, 'the mention search ran');
		for (const query of searched) {
			assert.ok(query.includes(IDS.team), 'the page\'s workspace is searched');
			assert.ok(!query.includes(IDS.homeA), 'another readable workspace is not');
		}
	});
});
