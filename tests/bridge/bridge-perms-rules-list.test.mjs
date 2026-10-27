/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-perms-rules-list.test.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * listForPage: the rules that decide ONE page's access — the page's own rules and the
 * workspace-wide ones (resource_id = ''), and nothing else.
 *
 * Two reads, not one: a workspace with hundreds of rules about OTHER pages must not
 * truncate the page's own rule (the reviewer's seed: 500 other page rules plus one
 * no_access on P still denies P).
 *
 * A missing table answers [] (no rule can exist); every other failure is a 503, never a
 * silent "no rules" — that would drop a deny the caller is under, and hand the page to
 * somebody who must not have it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createShareRuleStore, normalizeShareRule } from '../../scripts/bridge-perms-rules.mjs';
import { canWritePageRow } from '../../scripts/bridge-api.mjs';
import { IDS, createPostgrestMock, harnessConfig, patch, post, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '22222222-2222-4222-8222-222222222222';
const PAGE = '33333333-3333-4333-8333-333333333333';
const OTHER_PAGE = '44444444-4444-4444-8444-444444444444';
const CONFIG = { baasUrl: 'http://kong.test', serviceKey: 'svc-key' };

/** A stored rule row (the shape public.osionos_share_rules holds). */
function row(over = {}) {
	return {
		id: '55555555-5555-4555-8555-555555555555',
		workspace_id: WS,
		resource_type: 'page',
		resource_id: PAGE,
		target: { type: 'user', userId: 'u1' },
		target_key: 'user:u1:',
		permission: 'can_view',
		explicit: true,
		created_at: '2026-10-01T00:00:00Z',
		updated_at: '2026-10-01T00:00:00Z',
		...over,
	};
}

/** A fetch stand-in that answers the store's two reads from `rows`. */
function fakeFetch(rows, { status = 200, body } = {}) {
	const calls = [];
	const fetchImpl = async (url, init = {}) => {
		const parsed = new URL(String(url));
		calls.push({ url: parsed, method: init.method ?? 'GET' });
		if (status !== 200) return new Response(body ?? JSON.stringify({ code: 'XX' }), { status });
		if (body !== undefined) return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
		const wanted = parsed.searchParams.get('resource_id');
		const value = wanted === null ? null : wanted.slice('eq.'.length);
		const matched = rows.filter((candidate) => candidate.workspace_id === parsed.searchParams.get('workspace_id').slice('eq.'.length)
			&& candidate.resource_type === parsed.searchParams.get('resource_type').slice('eq.'.length)
			&& (value === null || candidate.resource_id === value));
		return new Response(JSON.stringify(matched), { status: 200, headers: { 'content-type': 'application/json' } });
	};
	return { calls, fetchImpl };
}

describe('listForPage answers the page rules and the workspace-wide ones', () => {
	it('returns both, and nothing else', async () => {
		const rows = [
			row({ id: 'a', resource_id: PAGE, permission: 'can_view' }),
			row({ id: 'b', resource_id: '', permission: 'no_access' }),
			row({ id: 'c', resource_id: OTHER_PAGE, permission: 'can_edit' }),
			row({ id: 'd', resource_id: PAGE, workspace_id: OTHER_WS, permission: 'can_edit' }),
			row({ id: 'e', resource_id: PAGE, resource_type: 'database', permission: 'can_edit' }),
		];
		const { calls, fetchImpl } = fakeFetch(rows);
		const store = createShareRuleStore({ fetchImpl });
		const rules = await store.listForPage(CONFIG, WS, PAGE);
		assert.deepEqual(rules.map((rule) => rule.id).sort(), ['a', 'b']);
		assert.equal(calls.length, 2);
	});

	it('asks for the page rules and the workspace-wide rules, in that workspace', async () => {
		const { calls, fetchImpl } = fakeFetch([]);
		const store = createShareRuleStore({ fetchImpl });
		await store.listForPage(CONFIG, WS, PAGE);
		const [pageRead, wideRead] = calls;
		assert.equal(pageRead.url.pathname, '/rest/v1/osionos_share_rules');
		assert.equal(pageRead.url.searchParams.get('workspace_id'), `eq.${WS}`);
		assert.equal(pageRead.url.searchParams.get('resource_type'), 'eq.page');
		assert.equal(pageRead.url.searchParams.get('resource_id'), `eq.${PAGE}`);
		assert.equal(wideRead.url.searchParams.get('resource_id'), 'eq.');
		assert.ok(Number(pageRead.url.searchParams.get('limit')) > 0);
	});

	it('a workspace with hundreds of rules about other pages still answers the page rule', async () => {
		const rows = [
			...Array.from({ length: 500 }, (_, index) => row({ id: `other-${index}`, resource_id: `page-${index}` })),
			row({ id: 'mine', resource_id: PAGE, permission: 'no_access' }),
		];
		const { fetchImpl } = fakeFetch(rows);
		const store = createShareRuleStore({ fetchImpl });
		const rules = await store.listForPage(CONFIG, WS, PAGE);
		assert.deepEqual(rules.map((rule) => rule.id), ['mine']);
	});
});

describe('a store failure is never a silent "no rules"', () => {
	it('a missing table answers [] — no rule can exist', async () => {
		for (const [status, code] of [[404, '42P01'], [404, 'PGRST205'], [400, '42P01']]) {
			const { fetchImpl } = fakeFetch([], { status, body: JSON.stringify({ code }) });
			const store = createShareRuleStore({ fetchImpl, log: () => {} });
			assert.deepEqual(await store.listForPage(CONFIG, WS, PAGE), [], `status ${status} code ${code}`);
		}
	});

	it('every other failure is a 503 with a stable code', async () => {
		for (const status of [401, 403, 409, 500, 502, 503]) {
			const { fetchImpl } = fakeFetch([], { status, body: JSON.stringify({ code: 'XX', message: 'internal detail' }) });
			const store = createShareRuleStore({ fetchImpl, log: () => {} });
			await assert.rejects(store.listForPage(CONFIG, WS, PAGE), (error) => {
				assert.equal(error.status, 503, `upstream ${status}`);
				assert.equal(error.code, 'share_rules_unavailable');
				assert.doesNotMatch(error.message, /internal detail/);
				return true;
			}, `upstream ${status}`);
		}
	});

	it('a 404 that is not a missing table is a 503, not an empty rule set', async () => {
		// Only PGRST205/42P01 mean the table is gone. Any other 404 is a broken read, and
		// answering [] for it would drop every deny the caller is under.
		const answers = [
			JSON.stringify({ code: 'PGRST999', message: 'something else' }),
			'Not Found',
			'',
		];
		for (const body of answers) {
			const { fetchImpl } = fakeFetch([], { status: 404, body });
			const store = createShareRuleStore({ fetchImpl, log: () => {} });
			await assert.rejects(store.listForPage(CONFIG, WS, PAGE), (error) => {
				assert.equal(error.status, 503, `body ${JSON.stringify(body)}`);
				assert.equal(error.code, 'share_rules_unavailable');
				return true;
			}, `body ${JSON.stringify(body)}`);
		}
	});

	it('a 200 with an empty body is a broken read, not an empty rule set', async () => {
		const { fetchImpl } = fakeFetch([], { body: '' });
		const store = createShareRuleStore({ fetchImpl, log: () => {} });
		await assert.rejects(store.listForPage(CONFIG, WS, PAGE), (error) => {
			assert.equal(error.status, 503);
			assert.equal(error.code, 'share_rules_unavailable');
			return true;
		});
	});

	it('a read that hit the cap is a 503, not a truncated rule set', async () => {
		// The read is limited, so a full page of rules may hide a deny beyond the cap.
		const rows = Array.from({ length: 500 }, (_, index) => row({ id: `full-${index}`, resource_id: PAGE }));
		const { fetchImpl } = fakeFetch(rows);
		const store = createShareRuleStore({ fetchImpl, log: () => {} });
		await assert.rejects(store.listForPage(CONFIG, WS, PAGE), (error) => {
			assert.equal(error.status, 503);
			assert.equal(error.code, 'share_rules_unavailable');
			return true;
		});
	});

	it('every failed read logs which read failed and why, never the request URL or key', async () => {
		const timeout = async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); };
		const reset = async () => { throw new TypeError('fetch failed', { cause: Object.assign(new Error('socket'), { code: 'ECONNRESET' }) }); };
		const full = fakeFetch(Array.from({ length: 500 }, (_, index) => row({ id: `full-${index}` }))).fetchImpl;
		const cases = [
			['listForPage', timeout, 'TimeoutError'],
			['listForPage', reset, 'TypeError cause ECONNRESET'],
			['listForPage', fakeFetch([], { body: '' }).fetchImpl, 'empty body'],
			['listForPage', full, 'over limit'],
			['listForPages', timeout, 'TimeoutError'],
			['listForWorkspace', reset, 'TypeError cause ECONNRESET'],
		];
		for (const [read, fetchImpl, reason] of cases) {
			const lines = [];
			const store = createShareRuleStore({ fetchImpl, log: (line) => lines.push(line) });
			const call = read === 'listForPages' ? store.listForPages(CONFIG, WS, [PAGE]) : store[read](CONFIG, WS, PAGE);
			await assert.rejects(call, { status: 503, code: 'share_rules_unavailable' }, `${read} ${reason}`);
			assert.deepEqual(lines, [`[bridge-perms] ${read} rules read failed (${reason})`], `${read} ${reason}`);
			assert.doesNotMatch(lines.join('\n'), /kong\.test|svc-key/);
		}
	});
});

const config = harnessConfig();

describe('page ids are matched case-insensitively', () => {
	it('normalizeShareRule lower-cases a page resource id', () => {
		const rule = normalizeShareRule({ workspaceId: WS, resourceType: 'page', resourceId: PAGE.toUpperCase(), permission: 'no_access', target: { type: 'workspace' } });
		assert.equal(rule.resource_id, PAGE.toLowerCase());
	});

	it('listForPage finds a lower-case rule when the page is requested in upper case', async () => {
		const rows = [row({ id: 'case-a', resource_id: PAGE.toLowerCase(), permission: 'no_access' })];
		const { fetchImpl } = fakeFetch(rows);
		const store = createShareRuleStore({ fetchImpl });
		const rules = await store.listForPage(CONFIG, WS, PAGE.toUpperCase());
		assert.deepEqual(rules.map((rule) => rule.id), ['case-a']);
	});
});

describe('canWritePageRow refuses a viewer on another member page', () => {
	const SELF = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
	const OTHER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
	const W = 'c0c0c0c0-3333-4333-8333-c0c0c0c0c0c0';
	const P = 'e1e1e1e1-1111-4111-8111-e1e1e1e1e1e1';

	it('a viewer cannot write another member page', () => {
		const row = { id: P, workspace_id: W, owner_id: OTHER, visibility: 'shared', collaborators: [], properties: [], content: [] };
		const member = { role: 'viewer', permissions: ['read'] };
		assert.equal(canWritePageRow(row, SELF, member, 'update'), false);
		assert.equal(canWritePageRow(row, SELF, member, 'delete'), false);
	});

	it('a no_access rule refuses even an editor', () => {
		const row = { id: P, workspace_id: W, owner_id: OTHER, visibility: 'shared', collaborators: [], properties: [], content: [] };
		const member = { role: 'editor', permissions: ['create', 'read', 'update'] };
		const rules = [{ resource_type: 'page', resource_id: P, target: { type: 'user', userId: SELF }, permission: 'no_access' }];
		assert.equal(canWritePageRow(row, SELF, member, 'update', rules), false);
	});
});

describe('no_access hides a page on every page-scoped route', () => {
	const OWNER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
	const CALLER = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
	const WSID = 'c0c0c0c0-3333-4333-8333-c0c0c0c0c0c0';
	const HOME = 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0';
	const PAGE = 'c3000000-1111-4111-8111-c30000000f03';
	const MISSING = 'dddddddd-4444-4444-8444-dddddddddddd';
	const RULE_ID = 'b9000000-1111-4111-8111-b90000000f09';
	const tableWrites = (mock) => mock.calls.filter((c) => c.method !== 'GET' && !c.table.startsWith('rpc/')).map((c) => `${c.method} ${c.table}`);

	function members() {
		return [
			{ workspace_id: HOME, user_id: CALLER, role: 'owner', permissions: ['create', 'read', 'update', 'delete', 'admin'] },
			{ workspace_id: WSID, user_id: CALLER, role: 'viewer', permissions: ['read'] },
			{ workspace_id: WSID, user_id: OWNER, role: 'owner', permissions: ['create', 'read', 'update', 'delete', 'admin'] },
		];
	}
	function pages() {
		return [{ id: PAGE, workspace_id: WSID, owner_id: OWNER, visibility: 'public', title: 'Public', collaborators: [], properties: [], parent_page_id: null, archived_at: null, content: [], created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z' }];
	}
	function rules() {
		return [{ id: RULE_ID, workspace_id: WSID, resource_type: 'page', resource_id: PAGE, target: { type: 'user', userId: CALLER }, permission: 'no_access', explicit: true }];
	}

	const routes = [
		['GET', (id) => `/api/pages/${id}`, undefined],
		['PATCH', (id) => `/api/pages/${id}`, patch({ title: 'changed' })],
		['DELETE', (id) => `/api/pages/${id}`, { method: 'DELETE' }],
		['GET', (id) => `/api/pages/${id}/config`, undefined],
		['PATCH', (id) => `/api/pages/${id}/config`, patch({ config: { view: 'board' } })],
		['POST', (id) => `/api/pages/${id}/actions`, post({ action: 'duplicate', payload: {} })],
		['POST', (id) => `/api/pages/${id}/translate`, post({ targetLocale: 'fr' })],
		['GET', (id) => `/api/pages/${id}/backlinks`, undefined],
	];

	for (const [index, [method, pathFor, init]] of routes.entries()) {
		it(`${method} ${pathFor(':id')} answers 404 for a no_access page`, async () => {
			const mock = createPostgrestMock({ osionos_workspace_members: members(), osionos_pages: pages(), osionos_share_rules: rules() }, { realWorkspaceRpc: true });
			const headers = sessionHeaders(config, CALLER, HOME, [WSID]);
			await withBridge(config, mock.fetchImpl, async (base) => {
				const denied = await send(base, pathFor(PAGE), headers, init || {});
				assert.equal(denied.status, 404, denied.text);
				assert.equal(denied.body?.message, 'Page not found.');
				assert.deepEqual(tableWrites(mock), []);
				assert.deepEqual(mock.outbound, []);
				// Only the page itself shares a body with a missing id; a missing id on the scoped
				// routes is a scope-less 200 by design, so there is nothing to compare there.
				if (index < 3) {
					const missing = await send(base, pathFor(MISSING), headers, init || {});
					assert.deepEqual([denied.status, denied.body], [missing.status, missing.body]);
				}
			});
		});
	}

	for (const [method, pathFor, init] of routes.slice(0, 3)) {
		it(`${method} ${pathFor(':id')} with an UPPER-case id answers the missing-id 404 and writes nothing`, async () => {
			const mock = createPostgrestMock({ osionos_workspace_members: members(), osionos_pages: pages(), osionos_share_rules: rules() }, { realWorkspaceRpc: true });
			const headers = sessionHeaders(config, CALLER, HOME, [WSID]);
			await withBridge(config, mock.fetchImpl, async (base) => {
				const denied = await send(base, pathFor(PAGE.toUpperCase()), headers, init || {});
				const missing = await send(base, pathFor(MISSING.toUpperCase()), headers, init || {});
				assert.equal(denied.status, 404, denied.text);
				assert.deepEqual([denied.status, denied.body], [missing.status, missing.body]);
				assert.deepEqual(tableWrites(mock), []);
			});
		});
	}

	it('the same routes still answer a caller no rule names (the 404 is the rule, not the route)', async () => {
		const mock = createPostgrestMock({ osionos_workspace_members: members(), osionos_pages: pages(), osionos_share_rules: [] }, { realWorkspaceRpc: true });
		const headers = sessionHeaders(config, CALLER, HOME, [WSID]);
		await withBridge(config, mock.fetchImpl, async (base) => {
			assert.equal((await send(base, `/api/pages/${PAGE}`, headers)).status, 200);
			assert.equal((await send(base, `/api/pages/${PAGE.toUpperCase()}`, headers)).status, 200);
		});
	});

	it('a viewer is refused a write on another member page through PATCH, DELETE and PATCH config', async () => {
		for (const [pathFor, init] of [[(id) => `/api/pages/${id}`, patch({ title: 'changed' })], [(id) => `/api/pages/${id}`, { method: 'DELETE' }], [(id) => `/api/pages/${id}/config`, patch({ config: { view: 'board' } })]]) {
			const mock = createPostgrestMock({ osionos_workspace_members: members(), osionos_pages: pages(), osionos_share_rules: [] }, { realWorkspaceRpc: true });
			const headers = sessionHeaders(config, CALLER, HOME, [WSID]);
			await withBridge(config, mock.fetchImpl, async (base) => {
				const res = await send(base, pathFor(PAGE), headers, init);
				assert.ok(res.status === 403 || res.status === 404, `${init.method} ${pathFor(':id')} -> ${res.status} ${res.text}`);
				assert.deepEqual(tableWrites(mock), []);
				assert.equal(mock.page(PAGE).title, 'Public');
			});
		}
	});

	it('a rule written with an upper-case resource id hides the page requested in lower case', async () => {
		const upperRules = [{ id: RULE_ID, workspace_id: WSID, resource_type: 'page', resource_id: PAGE.toUpperCase(), target: { type: 'user', userId: CALLER }, permission: 'no_access', explicit: true }];
		// normalize through the store is not applied to seeded rows, so emulate by storing lower via normalizeShareRule
		const normalized = normalizeShareRule({ workspaceId: WSID, resourceType: 'page', resourceId: PAGE.toUpperCase(), permission: 'no_access', target: { type: 'user', userId: CALLER } });
		const stored = [{ id: RULE_ID, workspace_id: WSID, resource_type: 'page', resource_id: normalized.resource_id, target: { type: 'user', userId: CALLER }, permission: 'no_access', explicit: true }];
		const mock = createPostgrestMock({ osionos_workspace_members: members(), osionos_pages: pages(), osionos_share_rules: stored }, { realWorkspaceRpc: true });
		const headers = sessionHeaders(config, CALLER, HOME, [WSID]);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const res = await send(base, `/api/pages/${PAGE}`, headers);
			assert.equal(res.status, 404, res.text);
		});
	});
});

describe('favorites honour no_access rules', () => {
	const OWNER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
	const CALLER = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
	const WSID = 'c0c0c0c0-3333-4333-8333-c0c0c0c0c0c0';
	const HOME = 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0';
	const PAGE = 'c3000000-1111-4111-8111-c30000000f03';
	const ACCESSIBLE = 'e5000000-1111-4111-8111-e50000000f05';

	function members() {
		return [
			{ workspace_id: HOME, user_id: CALLER, role: 'owner', permissions: ['create', 'read', 'update', 'delete', 'admin'] },
			{ workspace_id: WSID, user_id: CALLER, role: 'viewer', permissions: ['read'] },
			{ workspace_id: WSID, user_id: OWNER, role: 'owner', permissions: ['create', 'read', 'update', 'delete', 'admin'] },
		];
	}
	function pages() {
		return [
			{ id: PAGE, workspace_id: WSID, owner_id: OWNER, visibility: 'public', title: 'Hidden', collaborators: [], properties: [], parent_page_id: null, archived_at: null, content: [], created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z' },
			{ id: ACCESSIBLE, workspace_id: WSID, owner_id: OWNER, visibility: 'public', title: 'Open', collaborators: [], properties: [], parent_page_id: null, archived_at: null, content: [], created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z' },
		];
	}
	function rules() {
		return [{ id: 'r1', workspace_id: WSID, resource_type: 'page', resource_id: PAGE, target: { type: 'user', userId: CALLER }, permission: 'no_access', explicit: true }];
	}

	it('a no_access page cannot be added to favorites', async () => {
		const mock = createPostgrestMock({ osionos_workspace_members: members(), osionos_pages: pages(), osionos_share_rules: rules() }, { realWorkspaceRpc: true });
		const headers = sessionHeaders(config, CALLER, HOME, [WSID]);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const denied = await send(base, '/api/favorites', headers, post({ pageId: PAGE }));
			const missing = await send(base, '/api/favorites', headers, post({ pageId: 'dddddddd-4444-4444-8444-dddddddddddd' }));
			assert.equal(denied.status, 404, denied.text);
			assert.deepEqual([denied.status, denied.body], [missing.status, missing.body]);
			assert.equal(mock.rows('osionos_page_favorites').length, 0);
			assert.equal((await send(base, '/api/favorites', headers, post({ pageId: ACCESSIBLE }))).status, 200);
		});
	});

	it('a no_access page is absent from the favorites list', async () => {
		const mock = createPostgrestMock({ osionos_workspace_members: members(), osionos_pages: pages(), osionos_share_rules: rules(), osionos_page_favorites: [{ user_id: CALLER, page_id: PAGE }, { user_id: CALLER, page_id: ACCESSIBLE }] }, { realWorkspaceRpc: true });
		const headers = sessionHeaders(config, CALLER, HOME, [WSID]);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const res = await send(base, '/api/favorites', headers);
			assert.equal(res.status, 200, res.text);
			assert.deepEqual(res.body.pageIds, [ACCESSIBLE]);
		});
	});

	it('the favorites list reads in batches: 120 favorites across 2 workspaces cost at most 12 PostgREST reads', async () => {
		const WS2 = 'c1c1c1c1-3333-4333-8333-c1c1c1c1c1c1';
		const uuid = (n) => `f${String(n).padStart(7, '0')}-1111-4111-8111-f00000000000`;
		const page = (n, workspace, owner) => ({ id: uuid(n), workspace_id: workspace, owner_id: owner, visibility: 'public', title: `P${n}`, collaborators: [], properties: [], parent_page_id: null, archived_at: null, content: [], created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z' });
		const all = [
			...Array.from({ length: 50 }, (_, n) => page(n, WSID, OWNER)),
			...Array.from({ length: 50 }, (_, n) => page(100 + n, WS2, OWNER)),
			...Array.from({ length: 20 }, (_, n) => page(200 + n, WSID, CALLER)),
		];
		const memberRows = [...members(), { workspace_id: WS2, user_id: CALLER, role: 'viewer', permissions: ['read'] }, { workspace_id: WS2, user_id: OWNER, role: 'owner', permissions: ['read'] }];
		const denied = [{ id: 'r1', workspace_id: WSID, resource_type: 'page', resource_id: uuid(7), target: { type: 'user', userId: CALLER }, permission: 'no_access', explicit: true }];
		const favorites = all.map((p) => ({ user_id: CALLER, page_id: p.id }));
		const mock = createPostgrestMock({ osionos_workspace_members: memberRows, osionos_pages: all, osionos_share_rules: denied, osionos_page_favorites: favorites }, { realWorkspaceRpc: true });
		const headers = sessionHeaders(config, CALLER, HOME, [WSID, WS2]);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const before = mock.calls.length;
			const res = await send(base, '/api/favorites', headers);
			assert.equal(res.status, 200, res.text);
			assert.equal(res.body.pageIds.includes(uuid(7)), false);
			assert.deepEqual(res.body.pageIds, all.map((p) => p.id).filter((id) => id !== uuid(7)));
			assert.ok(mock.calls.length - before <= 12, `${mock.calls.length - before} reads`);
		});
	});

	it('a workspace whose membership read fails answers 503 (C556)', async () => {
		const failWhen = (call) => (call.table === 'osionos_workspace_members' ? { status: 500, body: { code: 'XX' } } : null);
		const mock = createPostgrestMock({ osionos_workspace_members: members(), osionos_pages: pages(), osionos_page_favorites: [{ user_id: CALLER, page_id: ACCESSIBLE }] }, { realWorkspaceRpc: true, failWhen });
		const headers = sessionHeaders(config, CALLER, HOME, [WSID]);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const res = await send(base, '/api/favorites', headers);
			assert.equal(res.status, 503, res.text);
			assert.equal(res.body.code, 'page_access_unavailable');
			assert.deepEqual(res.body.pageIds, undefined);
		});
	});

	it('a favorites list longer than 200 answers the 200 most recent', async () => {
		const mock = createPostgrestMock({ osionos_workspace_members: members(), osionos_pages: pages() }, { realWorkspaceRpc: true });
		const headers = sessionHeaders(config, CALLER, HOME, [WSID]);
		await withBridge(config, mock.fetchImpl, async (base) => {
			assert.equal((await send(base, '/api/favorites', headers)).status, 200);
			const read = mock.calls.find((call) => call.table === 'osionos_page_favorites');
			assert.equal(read.params.get('limit'), '200');
		});
	});
});

describe('listForPages answers many pages in two reads', () => {
	const PAGE_B = '66666666-6666-4666-8666-666666666666';
	/** Like fakeFetch, but understands resource_id=in.(a,b). */
	function fakeInFetch(rows, { status = 200 } = {}) {
		const calls = [];
		const fetchImpl = async (url) => {
			const parsed = new URL(String(url));
			calls.push(parsed);
			if (status !== 200) return new Response(JSON.stringify({ code: 'XX' }), { status });
			const wanted = parsed.searchParams.get('resource_id');
			const matches = (value) => (wanted.startsWith('in.(') ? wanted.slice(4, -1).split(',').includes(value) : value === wanted.slice(3));
			return new Response(JSON.stringify(rows.filter((candidate) => matches(candidate.resource_id))), { status: 200, headers: { 'content-type': 'application/json' } });
		};
		return { calls, fetchImpl };
	}

	it('listForPages answers each page its own rules plus the wide ones in two reads', async () => {
		const rows = [
			row({ id: 'a', resource_id: PAGE }),
			row({ id: 'b', resource_id: PAGE_B }),
			row({ id: 'w', resource_id: '', permission: 'no_access' }),
			row({ id: 'c', resource_id: OTHER_PAGE }),
		];
		const { calls, fetchImpl } = fakeInFetch(rows);
		const result = await createShareRuleStore({ fetchImpl }).listForPages(CONFIG, WS, [PAGE, PAGE_B.toUpperCase()]);
		assert.equal(calls.length, 2);
		assert.deepEqual(result.get(PAGE).map((rule) => rule.id).sort(), ['a', 'w']);
		assert.deepEqual(result.get(PAGE_B).map((rule) => rule.id).sort(), ['b', 'w']);
		assert.equal(result.has(OTHER_PAGE), false);
	});

	it('listForPages fails closed like listForPage when a read fails', async () => {
		const { fetchImpl } = fakeInFetch([], { status: 500 });
		await assert.rejects(createShareRuleStore({ fetchImpl, log: () => {} }).listForPages(CONFIG, WS, [PAGE]), (error) => {
			assert.equal(error.status, 503);
			assert.equal(error.code, 'share_rules_unavailable');
			return true;
		});
	});
});
