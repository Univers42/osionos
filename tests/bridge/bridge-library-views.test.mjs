/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-library-views.test.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 19:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 19:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Library L2 (verdict C900–C915): the Library views every member sees are stored on the
// workspace, and only its owner or an admin changes them. The 403 below is what makes the
// lock note's "only an admin" true.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { accessTicket, ticketIsCurrent } from '../../scripts/bridge-access-generation.mjs';
import { IDS, createPostgrestMock, harnessConfig, patch, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';
import { kvStub } from './support/kv-stub.mjs';

const config = harnessConfig();
const WS = IDS.team;
const OWNER = IDS.userA;
const ADMIN = 'cccccccc-3333-4333-8333-cccccccccccc';
const EDITOR = IDS.userB;
const VIEWER = 'dddddddd-4444-4444-8444-dddddddddddd';
const STRANGER = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';
const ALL = ['create', 'read', 'update', 'delete', 'admin'];

const as = {
	owner: sessionHeaders(config, OWNER, IDS.homeA),
	admin: sessionHeaders(config, ADMIN, 'c1c1c1c1-3333-4333-8333-c1c1c1c1c1c1', [WS]),
	editor: sessionHeaders(config, EDITOR, IDS.homeB, [WS]),
	viewer: sessionHeaders(config, VIEWER, 'd1d1d1d1-4444-4444-8444-d1d1d1d1d1d1', [WS]),
	stranger: sessionHeaders(config, STRANGER, 'e1e1e1e1-5555-4555-8555-e1e1e1e1e1e1', [WS]),
};
const path = `/api/workspaces/${WS}/library-views`;
const put = (body) => ({ method: 'PUT', body: JSON.stringify(body) });

function view(id, name = 'Hooks') {
	return {
		id, databaseId: 'workspace-library', name, type: 'table',
		filters: [{ id: 'f1', propertyId: 'library-kind', operator: 'equals', value: 'Hook' }], filterConjunction: 'and',
		sorts: [], visibleProperties: ['title'], settings: { locked: true },
	};
}
const VIEWS = { 'v-hooks': view('v-hooks') };

function world({ settings = {}, updatedAt = '2026-10-01T00:00:00.000Z' } = {}) {
	return {
		osionos_workspaces: [{ id: WS, owner_id: OWNER, name: 'Team', slug: 'team', visibility: 'confidential', settings, updated_at: updatedAt }],
		osionos_workspace_members: [
			{ workspace_id: WS, user_id: ADMIN, role: 'admin', permissions: ALL },
			{ workspace_id: WS, user_id: EDITOR, role: 'editor', permissions: ['create', 'read', 'update'] },
			{ workspace_id: WS, user_id: VIEWER, role: 'viewer', permissions: ['read'] },
		],
	};
}

async function run(seed, steps) {
	const mock = createPostgrestMock(seed);
	const results = await withBridge(config, mock.fetchImpl, async (base) => {
		const out = [];
		for (const [headers, init] of steps) out.push(await send(base, path, headers, init));
		return out;
	}, { kv: kvStub() });
	return { mock, results, stored: () => mock.rows('osionos_workspaces')[0].settings };
}

describe('GET /api/workspaces/:id/library-views (C904)', () => {
	it('every member reads the views; only owner and admin may curate', async () => {
		const seed = world({ settings: { library: { views: VIEWS, updatedAt: '2026-10-02T00:00:00.000Z' } } });
		for (const [role, canCurate] of [['owner', true], ['admin', true], ['editor', false], ['viewer', false]]) {
			const { results: [result] } = await run(seed, [[as[role]]]);
			assert.equal(result.status, 200, `${role}: ${result.text}`);
			assert.deepEqual(result.body, { views: VIEWS, updatedAt: '2026-10-02T00:00:00.000Z', canCurate }, role);
		}
	});

	it('a stranger gets the same 404 as the settings route', async () => {
		const { results: [result] } = await run(world(), [[as.stranger]]);
		assert.equal(result.status, 404);
		assert.equal(result.body.code, 'workspace_not_found');
	});

	it('an unset Library answers no views and a null stamp', async () => {
		const { results: [result] } = await run(world(), [[as.viewer]]);
		assert.deepEqual(result.body, { views: {}, updatedAt: null, canCurate: false });
	});

	it('a stored view that no longer passes is dropped on read (C908)', async () => {
		const bad = { ...view('v-bad'), settings: { icon: 'javascript:alert(1)' } };
		const seed = world({ settings: { library: { views: { ...VIEWS, 'v-bad': bad }, updatedAt: null } } });
		const { results: [result] } = await run(seed, [[as.viewer]]);
		assert.deepEqual(result.body.views, VIEWS);
	});
});

describe('PUT /api/workspaces/:id/library-views', () => {
	it('editor and viewer are refused 403 and nothing is written (C904)', async () => {
		for (const role of ['editor', 'viewer']) {
			const { results: [result], mock, stored } = await run(world(), [[as[role], put({ views: VIEWS, baseUpdatedAt: null })]]);
			assert.equal(result.status, 403, role);
			assert.deepEqual(stored(), {});
			assert.equal(mock.calls.filter((call) => call.method !== 'GET').length, 0, `${role}: no write, no audit`);
		}
	});

	it('a stranger PUT is 404', async () => {
		const { results: [result] } = await run(world(), [[as.stranger, put({ views: VIEWS, baseUpdatedAt: null })]]);
		assert.equal(result.status, 404);
	});

	it('owner and admin write; a member reads it back (C903)', async () => {
		for (const role of ['owner', 'admin']) {
			const { results: [written, read], stored } = await run(world(), [[as[role], put({ views: VIEWS, baseUpdatedAt: null })], [as.viewer]]);
			assert.equal(written.status, 200, `${role}: ${written.text}`);
			assert.deepEqual(written.body.views, VIEWS);
			assert.equal(written.body.updatedAt, stored().library.updatedAt, 'the stamp echoed is the one written');
			assert.deepEqual(read.body, { views: VIEWS, updatedAt: written.body.updatedAt, canCurate: false });
		}
	});

	it('a stale base is 409 with the current views and storage unchanged (C900)', async () => {
		const current = { views: VIEWS, updatedAt: '2026-10-02T00:00:00.000Z' };
		const { results: [result], stored } = await run(world({ settings: { library: current } }), [[as.admin, put({ views: { 'v-x': view('v-x') }, baseUpdatedAt: null })]]);
		assert.equal(result.status, 409);
		assert.equal(result.body.code, 'library_views_conflict');
		assert.deepEqual({ views: result.body.views, updatedAt: result.body.updatedAt }, current);
		assert.deepEqual(stored().library, current);
	});

	it('two PUTs on the same base: one 200, one 409 (C900)', async () => {
		const body = put({ views: VIEWS, baseUpdatedAt: null });
		const { results: [first, second] } = await run(world(), [[as.owner, body], [as.admin, body]]);
		assert.deepEqual([first.status, second.status], [200, 409]);
	});

	it('the next PUT on the echoed stamp is accepted and moves the stamp forward', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const first = await send(base, path, as.admin, put({ views: VIEWS, baseUpdatedAt: null }));
			const second = await send(base, path, as.admin, put({ views: {}, baseUpdatedAt: first.body.updatedAt }));
			assert.equal(second.status, 200, second.text);
			assert.ok(Date.parse(second.body.updatedAt) > Date.parse(first.body.updatedAt));
		}, { kv: kvStub() });
	});

	it('a microsecond +00:00 row stamp round-trips the conditional write (C902)', async () => {
		const { results: [result], mock } = await run(world({ updatedAt: '2026-10-01T00:00:00.123456+00:00' }), [[as.owner, put({ views: VIEWS, baseUpdatedAt: null })]]);
		assert.equal(result.status, 200, result.text);
		const write = mock.calls.find((call) => call.method === 'PATCH');
		assert.equal(write.params.get('updated_at'), 'eq.2026-10-01T00:00:00.123456+00:00');
	});

	it('an invalid view is 422 with its path and nothing is written (C905)', async () => {
		const { results: [result], stored } = await run(world(), [[as.owner, put({ views: { 'v-a': { ...view('v-a'), onLoad: 'x' } }, baseUpdatedAt: null })]]);
		assert.equal(result.status, 422);
		assert.equal(result.body.code, 'invalid_view');
		assert.equal(result.body.path, 'views.v-a');
		assert.deepEqual(stored(), {});
	});

	it('a bad baseUpdatedAt is 422', async () => {
		const { results: [result] } = await run(world(), [[as.owner, put({ views: VIEWS, baseUpdatedAt: 42 })]]);
		assert.equal(result.status, 422);
	});

	it('the 31st PUT in a minute is 429 (C910)', async () => {
		const steps = Array.from({ length: 31 }, () => [as.owner, put({ views: {}, baseUpdatedAt: 'stale' })]);
		const { results } = await run(world(), steps);
		assert.equal(results[29].status, 409);
		assert.equal(results[30].status, 429);
	});

	it('audits counts only, never a view name or value (C911)', async () => {
		const secret = { 'v-hooks': view('v-hooks', 'Salary review') };
		const { mock } = await run(world(), [[as.owner, put({ views: secret, baseUpdatedAt: null })]]);
		const audit = mock.calls.find((call) => call.table === 'osionos_bridge_audit_events');
		assert.ok(audit, 'one audit row');
		assert.equal(audit.body.event_type ?? audit.body.eventType, 'workspace.library_views_saved');
		assert.ok(!JSON.stringify(audit.body).includes('Salary'));
		assert.ok(!JSON.stringify(audit.body).includes('Hook'));
	});

	it('does not move the access generation (C912)', async () => {
		const ticket = accessTicket(OWNER, WS);
		await run(world(), [[as.owner, put({ views: VIEWS, baseUpdatedAt: null })]]);
		assert.ok(ticketIsCurrent(ticket));
	});
});

describe('the settings PATCH and the Library share one column (C901)', () => {
	it('a settings edit keeps the stored Library views', async () => {
		const library = { views: VIEWS, updatedAt: '2026-10-02T00:00:00.000Z' };
		const mock = createPostgrestMock(world({ settings: { icon: '🌏', library } }));
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, `/api/workspaces/${WS}/settings`, as.owner, patch({ icon: '🎯' })), { kv: kvStub() });
		assert.equal(result.status, 200, result.text);
		assert.equal(result.body.library, undefined, 'the settings route never answers the views');
		assert.deepEqual(mock.rows('osionos_workspaces')[0].settings.library, library);
	});

	it('a write that lost the race twice is 409, never a silent overwrite', async () => {
		const mock = createPostgrestMock(world(), { failWhen: (call) => (call.method === 'PATCH' && call.table === 'osionos_workspaces' ? { status: 200, body: [] } : null) });
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, `/api/workspaces/${WS}/settings`, as.owner, patch({ icon: '🎯' })), { kv: kvStub() });
		assert.equal(result.status, 409, result.text);
		assert.equal(result.body.code, 'settings_conflict');
		assert.equal(mock.calls.filter((call) => call.method === 'PATCH').length, 2, 'one retry, then refuse');
	});
});
