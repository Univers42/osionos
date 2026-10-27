/**
 * The AI agent's page tools apply the page share rules (inherited no_access) before any page
 * text reaches the model, and trust only live workspace membership — a removed member's token
 * still names the workspace. The bridge filter is injected; these cases drive the tools over a
 * stub PostgREST.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toolSearchPages, toolGetPage, callerWorkspaceIds } from '../../scripts/bridge-agent.mjs';

const WS = 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0';
const USER = 'a1a1a1a1-1111-4111-8111-a1a1a1a1a1a1';
const HIDDEN = 'b0b0b0b0-1111-4111-8111-b0b0b0b0b0b0';
const VISIBLE = 'c0c0c0c0-1111-4111-8111-c0c0c0c0c0c0';
const MISSING = 'd0d0d0d0-1111-4111-8111-d0d0d0d0d0d0';
const page = (id, title) => ({ id, title, workspace_id: WS, owner_id: USER, visibility: 'private', collaborators: [], archived_at: null, content: [{ type: 'paragraph', content: `${title} needle` }] });
const PAGES = [page(HIDDEN, 'Hidden'), page(VISIBLE, 'Visible')];
const SESSION = { userId: USER, workspaceIds: [WS] };

/** PostgREST stub: members answer `members` (or throw), pages honour `id=eq.`. */
function stubFetch({ members = [{ workspace_id: WS }], membersThrow = false } = {}) {
	return async (url) => {
		const parsed = new URL(String(url));
		let rows = [];
		if (parsed.pathname.endsWith('/osionos_workspace_members')) {
			if (membersThrow) throw new Error('members read failed');
			rows = members;
		} else if (parsed.pathname.endsWith('/osionos_pages')) {
			const id = parsed.searchParams.get('id');
			rows = id ? PAGES.filter((row) => `eq.${row.id}` === id) : PAGES;
		}
		return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } });
	};
}

const hideHidden = (rows) => rows.filter((row) => row.id !== HIDDEN);
const passAll = (rows) => rows;
const deps = (opts = {}, pageAccessFilter = hideHidden) => ({ config: { baasUrl: 'http://baas', serviceKey: 'k' }, fetchImpl: stubFetch(opts), env: {}, pageAccessFilter });
const notFound = { message: 'Page not found.', status: 404 };

describe('agent page tools apply the share rules', () => {
	it('a. a hidden page is neither searched nor fetched; a visible one is', async () => {
		const found = await toolSearchPages(deps(), SESSION, { query: 'needle' });
		assert.deepEqual(found.pages.map((p) => p.id), [VISIBLE]);
		await assert.rejects(toolGetPage(deps(), SESSION, { pageId: HIDDEN }), notFound);
		assert.equal((await toolGetPage(deps(), SESSION, { pageId: VISIBLE })).page.id, VISIBLE);
	});

	it('b. a hidden page answers exactly like a missing one', async () => {
		const hidden = await toolGetPage(deps(), SESSION, { pageId: HIDDEN }).catch((error) => error);
		const missing = await toolGetPage(deps(), SESSION, { pageId: MISSING }).catch((error) => error);
		assert.deepEqual([hidden.message, hidden.status], [missing.message, missing.status]);
	});

	it('c. no filter wired: nothing is visible', async () => {
		const found = await toolSearchPages(deps({}, null), SESSION, { query: 'needle' });
		assert.equal(found.count, 0);
		await assert.rejects(toolGetPage(deps({}, null), SESSION, { pageId: VISIBLE }), notFound);
	});

	it('d. an ex-member whose token still names the workspace sees nothing', async () => {
		const found = await toolSearchPages(deps({ members: [] }, passAll), SESSION, { query: 'needle' });
		assert.equal(found.count, 0);
		await assert.rejects(toolGetPage(deps({ members: [] }, passAll), SESSION, { pageId: VISIBLE }), notFound);
	});

	it('e. a failed members read fails closed', async () => {
		assert.deepEqual(await callerWorkspaceIds(deps({ membersThrow: true }), SESSION), []);
	});

	it('f. the filter sees every candidate before the query match', async () => {
		const seen = [];
		await toolSearchPages(deps({}, (rows) => { seen.push(rows.map((row) => row.id)); return []; }), SESSION, { query: 'zzz-no-match' });
		assert.deepEqual(seen, [[HIDDEN, VISIBLE]]);
	});
});
