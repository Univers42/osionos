/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-pat-mcp-routes.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The four routes the MCP server needs on top of the two page routes (list workspaces, list
 * pages, create a page, append blocks), and the last use of a token in the token list. Each
 * route is held to the guarantees of the gate: its scope, its mask, a rate limit before any
 * read, a 503 on any store failure and error bodies that never quote upstream text.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, send, sessionHeaders, teamPage } from './support/bridge-harness.mjs';
import { installResponseMask, patWritePayload, PAT_ROUTES } from '../../scripts/bridge-pat-middleware.mjs';
import { PAT_RESOURCES } from '../../scripts/bridge-pat-permissions.mjs';
import { PAT_TABLE } from './support/pat-postgrest.mjs';
import { bearer, EXPECTED_ROUTES, fakeRequest, fakeResponse, fineGrained, HOME, OWNER, PAGE, patRow, routeSignatures, startPatWorld } from './support/pat-world.mjs';

const ALL = ['create', 'read', 'update', 'delete', 'admin'];
const SECOND = 'a9a9a9a9-1111-4111-8111-a9a9a9a9a9a9';
const BLOCKS = [{ id: 'b9', type: 'paragraph', content: 'appended' }];
const MCP_APPEND = { blocks: BLOCKS, idempotencyKey: 'append-key-1' };
const LEAK = 'SECRET-ROW-VALUE-9d1e';

const seed = {
	osionos_workspace_members: [
		{ workspace_id: HOME, user_id: OWNER, role: 'owner', permissions: ALL },
		{ workspace_id: IDS.homeB, user_id: IDS.userB, role: 'owner', permissions: ALL },
	],
	osionos_workspaces: [{ id: IDS.homeB, owner_id: IDS.userB, created_at: '2026-10-01T00:00:00.000Z' }],
	osionos_pages: [
		{ ...teamPage(IDS.pageB, IDS.userB, 'private', 'B notes', 'B own text'), workspace_id: IDS.homeB },
		{ ...teamPage(SECOND, OWNER, 'private', 'Second', 'second body'), workspace_id: HOME },
	],
};
const appendRpc = (body) => [{ version: 5, content: body.p_blocks }];
const worldOptions = (extra = {}) => ({ seed, pagesOptions: { rpc: { osionos_page_append: appendRpc }, realWorkspaceRpc: true }, ...extra });

const ROUTES = [
	{ name: 'GET /api/workspaces', method: 'GET', path: '/api/workspaces', permission: 'read', status: 200 },
	{ name: 'GET /api/pages/all', method: 'GET', path: `/api/pages/all?workspaceId=${HOME}`, permission: 'read', status: 200 },
	{ name: 'POST /api/pages', method: 'POST', path: '/api/pages', permission: 'write', status: 201, body: { workspaceId: HOME, title: 'New' } },
	{ name: 'POST /api/pages/:id/blocks', method: 'POST', path: `/api/pages/${PAGE}/blocks`, permission: 'write', status: 200, body: MCP_APPEND },
];
const ROUTE_ONLY = ROUTES.map((route) => [route.name, route]);
const ofRoute = (route, secret) => [route.path, bearer(secret), { method: route.method, body: route.body ? JSON.stringify(route.body) : undefined }];
const call = (world, route, secret) => send(world.base, ...ofRoute(route, secret));
const rpcCalls = (world) => world.pages.calls.filter((entry) => entry.table === 'rpc/osionos_page_append');
const classic = (...scopes) => ({ scopes });

async function viaPat(t, spec, options = {}) {
	const { secret, row } = patRow(spec);
	return { world: await startPatWorld(t, { tokens: [row], ...worldOptions(options) }), secret, row };
}

describe('each MCP route passes the right scope and refuses the wrong one', () => {
	for (const [name, route] of ROUTE_ONLY) {
		const other = route.permission === 'read' ? 'write' : 'read';
		const wrong = [['a classic token of the other permission', classic(`pages:${other}`)], ['a fine-grained token of the other permission', fineGrained(['title', 'workspaceId'], [other])]];

		it(`${name}: a token with pages:${route.permission} gets ${route.status}`, async (t) => {
			const { world, secret } = await viaPat(t, classic(`pages:${route.permission}`));
			const answer = await call(world, route, secret);
			assert.equal(answer.status, route.status, answer.text);
		});

		for (const [label, spec] of wrong) {
			it(`${name}: ${label} gets 403 pat_scope_denied and the route does no work`, async (t) => {
				const { world, secret } = await viaPat(t, spec);
				const answer = await call(world, route, secret);
				assert.equal(answer.status, 403);
				assert.equal(answer.body.error, 'pat_scope_denied');
				assert.deepEqual(rpcCalls(world), []);
				assert.deepEqual(world.pages.calls.filter((entry) => entry.method === 'POST'), []);
			});
		}
	}
});

describe('a route outside the table stays refused', () => {
	const outside = [
		['DELETE', `/api/pages/${PAGE}`], ['GET', '/api/account/tokens'], ['POST', '/api/auth/bridge/session'],
		['GET', `/api/blocks?pageId=${PAGE}`], ['GET', '/api/pages'],
		['GET', `/api/workspaces/${HOME}`], ['GET', '/api/workspaces/'], ['GET', '/api/pages/all/x'], ['GET', '/api/pages/all/'], ['POST', '/api/pages/'], ['POST', `/api/pages/${PAGE}/blocks/x`], ['POST', `/api/pages/${PAGE}/blocksX`], ['POST', `/api/pages/${PAGE}/blocks/`], ['POST', `/api/pages/${PAGE}`], ['GET', `/api/pages/${PAGE}/blocks`],
	];

	it('answers 403 pat_route_not_allowed for each, with a token that holds both scopes', async (t) => {
		const { world, secret } = await viaPat(t, classic('pages:read', 'pages:write'));
		for (const [method, path] of outside) {
			const answer = await send(world.base, path, bearer(secret), { method, body: method === 'POST' ? '{}' : undefined });
			assert.equal(answer.status, 403, `${method} ${path}`);
			assert.equal(answer.body.error, 'pat_route_not_allowed', `${method} ${path}`);
		}
	});

	it('lists exactly the six routes, each by method, path and permission', () => {
		assert.deepEqual(routeSignatures(PAT_ROUTES), EXPECTED_ROUTES);
	});});

describe('the page list is masked per row', () => {
	it('keeps only _id and title of every row for a [_id, title] token', async (t) => {
		const { world, secret } = await viaPat(t, fineGrained(['_id', 'title']));
		const answer = await send(world.base, `/api/pages/all?workspaceId=${HOME}`, bearer(secret));
		assert.equal(answer.status, 200, answer.text);
		assert.ok(answer.body.length >= 2);
		for (const entry of answer.body) assert.deepEqual(Object.keys(entry).sort(), ['_id', 'title']);
		assert.ok(!answer.text.includes('content'));
	});

	const sentFor = (body, options = { rows: true }) => {
		const response = fakeResponse();
		installResponseMask(response, ['title'], options);
		response.writeHead(200, { 'content-type': 'application/json' });
		response.end(body);
		return response.sent;
	};

	for (const [name, body] of [['a non-array object', '{"title":"x","content":"c"}'], ['an array with a non-object element', '[{"title":"x"},"leaked content"]'], ['an array holding null', '[null]'], ['text', 'plain content']]) {
		it(`answers 500 pat_mask_failed for ${name} on a list route and forwards nothing`, () => {
			const sent = sentFor(body);
			assert.equal(sent.head.status, 500);
			assert.equal(JSON.parse(sent.body).error, 'pat_mask_failed');
			assert.ok(!sent.body.includes('content'));
		});
	}

	it('still refuses an array on a route that is not a list', () => {
		assert.equal(sentFor('[{"title":"x"}]', {}).head.status, 500);
	});
});

describe('the append body is checked against the mask', () => {
	const grantsContent = (read) => ({ kind: 'fine_grained', scopes: [], grants: [{ resource: 'pages', attributes: read, permissions: ['write'] }] });
	const append = (world, secret, body) => send(world.base, `/api/pages/${PAGE}/blocks`, bearer(secret), { method: 'POST', body: JSON.stringify(body) });

	it('lets a classic pages:write token append the exact MCP body and the full set of keys', async (t) => {
		const { world, secret } = await viaPat(t, classic('pages:write'));
		assert.equal((await append(world, secret, MCP_APPEND)).status, 200);
		assert.equal((await append(world, secret, { ...MCP_APPEND, afterBlockId: 'b1' })).status, 200);
		assert.equal(rpcCalls(world).length, 2);
	});

	it('refuses a mask without content with 403 pat_forbidden_attribute naming content, and calls no RPC', async (t) => {
		const { world, secret } = await viaPat(t, grantsContent(['title']));
		const answer = await append(world, secret, MCP_APPEND);
		assert.equal(answer.status, 403);
		assert.equal(answer.body.code, 'pat_forbidden_attribute');
		assert.deepEqual(rpcCalls(world), []);
	});

	it('accepts a fine-grained token that may write content', async (t) => {
		const { world, secret } = await viaPat(t, grantsContent(['content']));
		assert.equal((await append(world, secret, MCP_APPEND)).status, 200);
	});

	for (const extra of [{ foo: 1 }, { title: 'x' }, { archivedAt: '2026-10-23T00:00:00.000Z' }]) {
		it(`refuses the extra key ${Object.keys(extra)[0]} with 403 and calls no RPC`, async (t) => {
			const { world, secret } = await viaPat(t, classic('pages:write'));
			const answer = await append(world, secret, { ...MCP_APPEND, ...extra });
			assert.equal(answer.status, 403);
			assert.equal(answer.body.code, 'pat_forbidden_attribute');
			assert.deepEqual(rpcCalls(world), []);
		});
	}

	it('does not make idempotencyKey a control field of any other route', async (t) => {
		const { world, secret } = await viaPat(t, classic('pages:write'));
		const answer = await send(world.base, `/api/pages/${PAGE}`, bearer(secret), { method: 'PATCH', body: JSON.stringify({ idempotencyKey: 'append-key-1' }) });
		assert.equal(answer.status, 403);
		assert.equal(answer.body.code, 'pat_forbidden_attribute');
	});

	it('names the offending keys in the thrown error', () => {
		const marked = (mask) => Object.assign([...mask], { route: 'blocks-append' });
		assert.throws(() => patWritePayload({ blocks: BLOCKS, foo: 1 }, marked(['content'])), (error) => error.message.includes('foo'));
		assert.throws(() => patWritePayload({ blocks: BLOCKS }, marked(['title'])), (error) => error.message.includes('content'));
	});

	it('keeps the route key set on the marker only', () => {
		const full = [...PAT_RESOURCES.pages.attributes];
		const body = { blocks: BLOCKS, idempotencyKey: 'k1234567', afterBlockId: null };
		assert.equal(patWritePayload(body, Object.assign([...full], { route: 'blocks-append' })), body);
		assert.throws(() => patWritePayload(body, full), (error) => error.status === 403 && error.code === 'pat_forbidden_attribute');
	});
});

describe('the workspaces list is a projection', () => {
	const row = (id, settings) => ({ workspace_id: id, owner_id: OWNER, workspace_name: 'Home', workspace_slug: 'home', workspace_settings: settings, workspace_role: 'owner', permissions: ALL, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-02T00:00:00.000Z' });

	it('answers only _id, id, name, slug and role, whatever the token mask', async (t) => {
		const { world, secret } = await viaPat(t, fineGrained(['title']), { workspaceRows: [row(HOME, { secret: 'x', plan: 'Pro' })] });
		const answer = await send(world.base, '/api/workspaces', bearer(secret));
		assert.equal(answer.status, 200, answer.text);
		assert.deepEqual(answer.body, [{ _id: HOME, id: HOME, name: 'Home', slug: 'home', role: 'owner' }]);
		for (const key of ['settings', 'permissions', 'ownerId', 'plan', 'createdAt', 'updatedAt', 'secret']) assert.ok(!answer.text.includes(key), key);
	});

	it('projects the fallback entry too, which names no real workspace', async (t) => {
		const { world, secret } = await viaPat(t, classic('pages:read'), { workspaceRows: [] });
		const answer = await send(world.base, '/api/workspaces', bearer(secret));
		assert.equal(answer.status, 200);
		assert.deepEqual(Object.keys(answer.body[0]).sort(), ['_id', 'id', 'name', 'role', 'slug']);
	});
});

describe('a token reaches only its owner’s workspaces', () => {
	it('answers 404 for a private page of another user', async (t) => {
		const { world, secret } = await viaPat(t, classic('pages:read'));
		const answer = await send(world.base, `/api/pages/${IDS.pageB}`, bearer(secret));
		assert.equal(answer.status, 404);
		assert.ok(!answer.text.includes('B own text'));
	});

	it('answers 403 for the page list of another user’s workspace, never a list', async (t) => {
		const { world, secret } = await viaPat(t, classic('pages:read'));
		const answer = await send(world.base, `/api/pages/all?workspaceId=${IDS.homeB}`, bearer(secret));
		assert.equal(answer.status, 403);
		assert.ok(!Array.isArray(answer.body));
		assert.ok(!answer.text.includes('B notes'));
	});

	it('never lists the workspace of another user', async (t) => {
		const { world, secret } = await viaPat(t, classic('pages:read'));
		const answer = await send(world.base, '/api/workspaces', bearer(secret));
		assert.deepEqual(answer.body.map((entry) => entry._id), [HOME]);
	});

	it('refuses to create a page in another user’s workspace and writes no row', async (t) => {
		const { world, secret } = await viaPat(t, classic('pages:write'));
		const answer = await send(world.base, '/api/pages', bearer(secret), { method: 'POST', body: JSON.stringify({ workspaceId: IDS.homeB, title: 'Planted' }) });
		assert.equal(answer.status, 403, answer.text);
		assert.ok(!world.pages.rows('osionos_pages').some((entry) => entry.title === 'Planted'));
	});
});

describe('a write token appends and creates only where its owner may', () => {
	it('answers exactly 404 to an append on another user’s page and calls no RPC', async (t) => {
		const { world, secret } = await viaPat(t, classic('pages:write'));
		const answer = await send(world.base, `/api/pages/${IDS.pageB}/blocks`, bearer(secret), { method: 'POST', body: JSON.stringify(MCP_APPEND) });
		assert.equal(answer.status, 404, answer.text);
		assert.deepEqual(rpcCalls(world), []);
	});

	// Pins today's behaviour: ownerId is ignored, collaborators is stored. Narrowing either is a visible change.
	it('stores collaborators from a classic token’s create and ignores ownerId', async (t) => {
		const { world, secret } = await viaPat(t, classic('pages:write'));
		const body = { workspaceId: HOME, title: 'Shared', ownerId: IDS.userB, collaborators: [IDS.userB] };
		const answer = await send(world.base, '/api/pages', bearer(secret), { method: 'POST', body: JSON.stringify(body) });
		assert.equal(answer.status, 201, answer.text);
		const stored = world.pages.rows('osionos_pages').find((entry) => entry.title === 'Shared');
		assert.equal(stored.owner_id, OWNER);
		assert.deepEqual(stored.collaborators, [IDS.userB]);
	});
});

describe('the token list carries the last use', () => {
	it('answers lastUsedAt, ISO or null, and never the hash, with revoked tokens absent', async (t) => {
		const used = patRow({ lastUsedAt: '2026-10-22T10:00:00.000Z' });
		const unused = patRow();
		const revoked = patRow({ revokedAt: '2026-10-02T00:00:00.000Z' });
		const world = await startPatWorld(t, { tokens: [used.row, unused.row, revoked.row] });
		const answer = await send(world.base, '/api/account/tokens', sessionHeaders(world.config, OWNER, HOME));
		assert.equal(answer.status, 200, answer.text);
		const byId = new Map(answer.body.tokens.map((token) => [token.id, token]));
		assert.equal(byId.get(used.row.id).lastUsedAt, '2026-10-22T10:00:00.000Z');
		assert.equal(byId.get(unused.row.id).lastUsedAt, null);
		assert.equal(byId.has(revoked.row.id), false);
		assert.ok(!answer.text.includes('token_hash') && !answer.text.includes(used.row.token_hash) && !answer.text.includes(used.secret));
	});
});

describe('the hot path and revocation', () => {
	const patches = (world) => world.patStore.callsTo(PAT_TABLE).filter((entry) => entry.method === 'PATCH');

	it('issues one PATCH on the token table for two calls in an hour, and none for the second', async (t) => {
		const { world, secret } = await viaPat(t, classic('pages:read'));
		await send(world.base, '/api/workspaces', bearer(secret));
		assert.equal(patches(world).length, 1);
		await send(world.base, '/api/workspaces', bearer(secret));
		assert.equal(patches(world).length, 1);
	});

	it('issues none when the token was used a minute ago', async (t) => {
		const { world, secret } = await viaPat(t, classic('pages:read'), {});
		world.patStore.rows(PAT_TABLE)[0].last_used_at = new Date(Date.now() - 60_000).toISOString();
		await send(world.base, '/api/workspaces', bearer(secret));
		assert.equal(patches(world).length, 0);
	});

	it('claims again once the last use is older than the hour', async (t) => {
		const { world, secret } = await viaPat(t, classic('pages:read'));
		world.patStore.rows(PAT_TABLE)[0].last_used_at = new Date(Date.now() - 2 * 3_600_000).toISOString();
		await send(world.base, '/api/workspaces', bearer(secret));
		assert.equal(patches(world).length, 1);
	});

	it('answers 401 pat_invalid on the very next call after the token is revoked', async (t) => {
		const { world, secret, row } = await viaPat(t, classic('pages:read'));
		assert.equal((await send(world.base, '/api/workspaces', bearer(secret))).status, 200);
		const revoke = await send(world.base, `/api/account/tokens/${row.id}`, sessionHeaders(world.config, OWNER, HOME), { method: 'DELETE' });
		assert.equal(revoke.status, 204, revoke.text);
		const answer = await send(world.base, '/api/workspaces', bearer(secret));
		assert.equal(answer.status, 401);
		assert.equal(answer.text, '{"error":"pat_invalid"}');
	});

	it('answers 401 pat_invalid on the very next call after the token expires', async (t) => {
		const { world, secret } = await viaPat(t, classic('pages:read'));
		assert.equal((await send(world.base, '/api/workspaces', bearer(secret))).status, 200);
		world.patStore.rows(PAT_TABLE)[0].expires_at = '2026-01-01T00:00:00.000Z';
		const answer = await send(world.base, '/api/workspaces', bearer(secret));
		assert.equal(answer.status, 401);
		assert.equal(answer.text, '{"error":"pat_invalid"}');
	});
});

describe('every MCP route inherits the guarantees of the gate', () => {
	for (const [name, route] of ROUTE_ONLY) {
		it(`${name}: a token-store failure is 503, never a refusal`, async (t) => {
			const { world, secret } = await viaPat(t, classic('pages:read', 'pages:write'), { fail: (entry) => (entry.table === PAT_TABLE ? { status: 500 } : null) });
			const answer = await call(world, route, secret);
			assert.equal(answer.status, 503);
			assert.notEqual(answer.body.error, 'pat_invalid');
		});

		it(`${name}: a members outage is a 503 from the gate`, async (t) => {
			const { world, secret } = await viaPat(t, classic('pages:read', 'pages:write'));
			const gate = world.gateWith(undefined, { memberWorkspaceEntries: async () => { throw new Error('members down'); } });
			const url = new URL(`http://bridge.test${route.path}`);
			await assert.rejects(gate(fakeRequest(secret, { method: route.method, path: route.path }), fakeResponse(), url, world.config), (error) => error.status === 503);
		});

		it(`${name}: the rate limit answers 429 and stops reading the token table`, async (t) => {
			const { secret, row } = patRow(classic('pages:read', 'pages:write'));
			const world = await startPatWorld(t, { tokens: [row], ...worldOptions({ rateLimit: { limit: 2, windowMs: 60_000 } }) });
			const statuses = [];
			for (let index = 0; index < 5; index += 1) statuses.push((await call(world, route, secret)).status);
			assert.deepEqual(statuses.slice(2), [429, 429, 429]);
			assert.equal(world.patStore.callsTo(PAT_TABLE).filter((entry) => entry.method === 'GET').length, 2);
		});
	}

	const failures = [
		['POST /api/pages', ROUTES[2], (entry) => entry.table === 'osionos_pages' && entry.method === 'POST'],
		['POST /api/pages/:id/blocks', ROUTES[3], (entry) => entry.table === 'rpc/osionos_page_append'],
		['GET /api/pages/all', ROUTES[1], (entry) => entry.table === 'osionos_workspace_members' && entry.params.get('limit') === '2'],
	];
	for (const [name, route, matches] of failures) {
		it(`${name}: an upstream refusal reaches the client as a fixed sentence, never its text`, async (t) => {
			const pageFail = (entry) => (matches(entry) ? { status: 400, body: { code: '23514', message: `violates check constraint. Failing row contains (${LEAK})` } } : null);
			const { world, secret } = await viaPat(t, classic('pages:read', 'pages:write'), { pageFail });
			const answer = await call(world, route, secret);
			assert.ok(answer.status >= 400, answer.text);
			assert.ok(!answer.text.includes(LEAK), answer.text);
			if (answer.body.message !== undefined) assert.match(answer.body.message, /^(The request was not accepted\.|Not allowed\.|Not found\.|The service is unavailable; try again\.|The request failed\.)$/);
		});
	}

	it('POST /api/pages: the reply is _id plus what the read mask allows', async (t) => {
		const created = async (spec) => {
			const { world, secret } = await viaPat(t, spec);
			return (await send(world.base, '/api/pages', bearer(secret), { method: 'POST', body: JSON.stringify({ workspaceId: HOME, title: 'New' }) })).body;
		};
		const writeOnly = await created(classic('pages:write'));
		assert.deepEqual(Object.keys(writeOnly), ['_id']);
		const titled = await created({ kind: 'fine_grained', scopes: [], grants: [{ resource: 'pages', attributes: ['title', 'workspaceId'], permissions: ['write'] }, { resource: 'pages', attributes: ['title'], permissions: ['read'] }] });
		assert.deepEqual(Object.keys(titled).sort(), ['_id', 'title']);
	});

	it('POST /api/pages/:id/blocks: the reply carries version and content only with the read of content', async (t) => {
		const appended = async (spec) => {
			const { world, secret } = await viaPat(t, spec);
			return (await send(world.base, `/api/pages/${PAGE}/blocks`, bearer(secret), { method: 'POST', body: JSON.stringify(MCP_APPEND) })).body;
		};
		assert.deepEqual(Object.keys(await appended(classic('pages:write'))), ['ok']);
		assert.deepEqual(Object.keys(await appended(classic('pages:write', 'pages:read'))).sort(), ['content', 'ok', 'version']);
	});
});
