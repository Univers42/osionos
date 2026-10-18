/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-baas-body-more.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A 2xx BaaS answer whose body stops mid-stream, or arrives as text that is not
// JSON, is a broken read — never the empty answer a reader returns for a body-less
// response. Every reader below answers "no rows" through that empty value, and for
// the share store empty means "no rules", so the access decision would be taken on
// missing data. The comment above each block names the entry point used to drive it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { baasRegistryGet, persistBridgeIdentity } from '../../scripts/bridge-api.mjs';
import { createShareRuleStore } from '../../scripts/bridge-perms-rules.mjs';
import { authorizeRtcJoin } from '../../scripts/bridge-rtc.mjs';
import { IDS, createPostgrestMock, harnessConfig, post, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asA = sessionHeaders(config, IDS.userA, IDS.homeA);

const GARBLED = '[{"id":"x"';

/** A 200 whose body stops after a partial array and errors mid-stream. */
function cutResponse() {
	return new Response(new ReadableStream({
		start(control) {
			control.enqueue(new TextEncoder().encode('[{"id":'));
			control.error(new Error('terminated'));
		},
	}), { status: 200, headers: { 'content-type': 'application/json' } });
}

/** A 200 whose body is text that is not JSON. */
const garbledResponse = () => new Response(GARBLED, { status: 200, headers: { 'content-type': 'application/json' } });

/** A 2xx that carries no body at all — the one case that still reads as empty. */
const emptyResponse = () => new Response(null, { status: 204 });

/** A 409 whose body stops mid-stream: the write client classifies it by its own
 *  status, so an unreadable body on a non-2xx is passed through as that status. */
function conflictCutResponse() {
	return new Response(new ReadableStream({
		start(control) {
			control.enqueue(new TextEncoder().encode('{"code":'));
			control.error(new Error('terminated'));
		},
	}), { status: 409, headers: { 'content-type': 'application/json' } });
}

/** The 502 a broken read has to raise. A body that stopped mid-stream names the service
 *  whose answer never arrived; text that is not JSON carries its byte length, so an
 *  operator can size the answer without the answer itself ever being logged. */
const isBrokenRead = (service, bytes) => (error) => {
	assert.equal(error.status, 502, error.message);
	if (bytes === undefined) {
		assert.match(error.message, /could not be read/i);
		assert.match(error.message, service);
	} else {
		assert.match(error.message, /not valid JSON/i);
		assert.ok(error.message.includes(`${bytes} bytes`), error.message);
	}
	assert.doesNotMatch(error.message, /"id"/);
	return true;
};

// ── 1. share rules — driven directly through the exported store ──────────────

const RULE_CONFIG = { baasUrl: 'http://kong.test', serviceKey: 'svc-key' };
const WS = '22222222-2222-4222-8222-222222222222';
const rules = (answer) => createShareRuleStore({ fetchImpl: async () => answer(), log: () => {} });

describe('the share-rule store answers 502, never an empty rule list, on a broken body', () => {
	it('answers 502 when the rule body stops mid-stream', async () => {
		await assert.rejects(rules(cutResponse).list(RULE_CONFIG, WS), isBrokenRead(/share rules/i));
	});

	it('answers 502 when the rule body is not valid JSON', async () => {
		await assert.rejects(rules(garbledResponse).list(RULE_CONFIG, WS), isBrokenRead(/share rules/i, Buffer.byteLength(GARBLED)));
	});

	it('still answers an empty rule list for a body-less read', async () => {
		assert.deepEqual(await rules(emptyResponse).list(RULE_CONFIG, WS), []);
	});
});

// ── 2. LiveKit room lookup — driven through the exported join hook ───────────
// The hook reads osionos_channels first (the channel exists, in IDS.team); the
// membership read it then makes is the one these tests break.

const RTC_CONFIG = { baasUrl: 'http://baas.local', serviceKey: 'svc-key' };
const CHANNEL = '5f5f5f5f-1111-4111-8111-5f5f5f5f5f5f';
const rtcJoin = (answer) => authorizeRtcJoin({
	userId: IDS.userA,
	channelId: CHANNEL,
	workspaceId: IDS.team,
	config: RTC_CONFIG,
	fetchImpl: async (url) => (String(url).includes('osionos_channels') ? Response.json([{ workspace_id: IDS.team }]) : answer()),
});

describe('the LiveKit room lookup answers 502, never "not a member", on a broken body', () => {
	it('answers 502 when the membership body stops mid-stream', async () => {
		await assert.rejects(rtcJoin(cutResponse), isBrokenRead(/LiveKit/i));
	});

	it('answers 502 when the membership body is not valid JSON', async () => {
		await assert.rejects(rtcJoin(garbledResponse), isBrokenRead(/LiveKit/i, Buffer.byteLength(GARBLED)));
	});

	it("still answers 403 for a body-less membership read, as it answers 'no member'", async () => {
		await assert.rejects(rtcJoin(emptyResponse), (error) => error.status === 403 && /not a member/i.test(error.message));
	});

	it('still reads a membership row when the body is JSON', async () => {
		assert.deepEqual(await rtcJoin(() => Response.json([{ role: 'editor', permissions: ['read'] }])), { workspaceId: IDS.team, role: 'editor', permissions: ['read'] });
	});
});

// ── 3. bridge identity — driven directly through the exported upsert ─────────

const IDENTITY = { provider: 'prismatica', subject: IDS.userA, email: 'member@example.com', name: 'Member' };
const identity = (answer) => persistBridgeIdentity(IDENTITY, config, async () => answer());

describe('bridge identity answers 502, never a missing workspace, on a broken body', () => {
	it('answers 502 when the upsert body stops mid-stream', async () => {
		await assert.rejects(identity(cutResponse), isBrokenRead(/identity/i));
	});

	it('answers 502 when the upsert body is not valid JSON', async () => {
		await assert.rejects(identity(garbledResponse), isBrokenRead(/identity/i, Buffer.byteLength(GARBLED)));
	});

	it('still answers null for a body-less upsert', async () => {
		assert.equal(await identity(emptyResponse), null);
	});

	it('still reads the persisted workspace row when the body is JSON', async () => {
		const row = Response.json([{ workspace_id: IDS.team, workspace_name: 'Home', workspace_slug: 'home' }]);
		assert.deepEqual(await identity(() => row), { workspaceId: IDS.team, workspaceName: 'Home', workspaceSlug: 'home' });
	});
});

// ── 7. adapter-registry — driven directly through the exported reader ────────

const REGISTRY_CONFIG = { adapterRegistryUrl: 'http://registry.local' };
const TENANT = 'd0d0d0d0-1111-4111-8111-d0d0d0d0d0d0';
const registry = (answer) => baasRegistryGet(REGISTRY_CONFIG, async () => answer(), '/databases', TENANT);

describe('the adapter-registry read answers 502, never an empty mount list, on a broken body', () => {
	it('answers 502 when the registry body stops mid-stream', async () => {
		await assert.rejects(registry(cutResponse), isBrokenRead(/adapter-registry/i));
	});

	it('answers 502 when the registry body is not valid JSON', async () => {
		await assert.rejects(registry(garbledResponse), isBrokenRead(/adapter-registry/i, Buffer.byteLength(GARBLED)));
	});

	it('still answers an empty mount list for a body-less read', async () => {
		assert.deepEqual(await registry(emptyResponse), []);
	});

	it('still reads the mount rows when the body is JSON', async () => {
		const rows = Response.json([{ id: IDS.team, name: 'Tasks', engine: 'postgresql' }]);
		assert.deepEqual(await registry(() => rows), [{ id: IDS.team, name: 'Tasks', engine: 'postgresql' }]);
	});
});

// ── 4, 5, 6. query-router — driven through the HTTP harness ──────────────────
// The three readers are private to bridge-api.mjs, so each is driven by the route
// that calls it, over withBridge + send. Only the query-router answer is replaced;
// the mount ACL calls still go to the PostgREST mock.

const DB = 'f0f0f0f0-6666-4666-8666-f0f0f0f0f0f0';
const TABLES_PATH = `/${DB}/tables/tasks`;
const SCHEMA_PATH = `/${DB}/schema`;

/** The bridge over a workspace mounted with DB, answering the query-router's `path`
 *  with `answer()` and everything else from the PostgREST mock. */
function routerBridge(path, answer, run) {
	const world = teamWorld();
	world.osionos_workspace_databases = [{ workspace_id: IDS.team, db_id: DB, engine: 'postgresql', tables: ['tasks'], edges_table: null, label: 'Tasks' }];
	const inner = createPostgrestMock(world).fetchImpl;
	const fetchImpl = async (url, init = {}) => (
		new URL(String(url)).origin === 'http://query-router.local' && new URL(String(url)).pathname === path
			? answer()
			: inner(url, init)
	);
	return withBridge(config, fetchImpl, run);
}

describe('the query-router readers answer 502 on a broken body, and keep their empty answer', () => {
	// reader 4 — baasQueryPost, behind the record read (/api/records/:dbId/:table/:pk/open)
	it('answers 502 when the record read stops mid-stream', async () => {
		await routerBridge(TABLES_PATH, cutResponse, async (base) => {
			const answer = await send(base, `/api/records/${DB}/tasks/7/open`, asA, { method: 'POST' });
			assert.equal(answer.status, 502, answer.text);
			assert.match(answer.text, /query-router/);
		});
	});

	it('answers 502 when the record read is not valid JSON', async () => {
		await routerBridge(TABLES_PATH, garbledResponse, async (base) => {
			const answer = await send(base, `/api/records/${DB}/tasks/7/open`, asA, { method: 'POST' });
			assert.equal(answer.status, 502, answer.text);
			assert.match(answer.text, /not valid JSON/);
		});
	});

	it("still answers 404 'not found' for a body-less record read", async () => {
		await routerBridge(TABLES_PATH, emptyResponse, async (base) => {
			const answer = await send(base, `/api/records/${DB}/tasks/7/open`, asA, { method: 'POST' });
			assert.equal(answer.status, 404, answer.text);
			assert.match(answer.text, /not found/i);
		});
	});

	// reader 5 — baasQueryGet, behind the schema read (/api/databases/:dbId/schema)
	it('answers 502 when the schema read stops mid-stream', async () => {
		await routerBridge(SCHEMA_PATH, cutResponse, async (base) => {
			const answer = await send(base, `/api/databases/${DB}/schema`, asA);
			assert.equal(answer.status, 502, answer.text);
			assert.match(answer.text, /query-router/);
		});
	});

	it('answers 502 when the schema read is not valid JSON', async () => {
		await routerBridge(SCHEMA_PATH, garbledResponse, async (base) => {
			const answer = await send(base, `/api/databases/${DB}/schema`, asA);
			assert.equal(answer.status, 502, answer.text);
			assert.match(answer.text, /not valid JSON/);
		});
	});

	it('still answers an empty schema for a body-less read', async () => {
		await routerBridge(SCHEMA_PATH, emptyResponse, async (base) => {
			const answer = await send(base, `/api/databases/${DB}/schema`, asA);
			assert.equal(answer.status, 200, answer.text);
			assert.deepEqual(answer.body.tables, []);
			assert.equal(answer.body.engine, 'unknown');
		});
	});

	// reader 6 — baasQueryPassthrough, behind the table route (/api/databases/:dbId/tables/:table)
	it('answers 502 when the table answer stops mid-stream', async () => {
		await routerBridge(TABLES_PATH, cutResponse, async (base) => {
			const answer = await send(base, `/api/databases/${DB}/tables/tasks`, asA, post({ op: 'list' }));
			assert.equal(answer.status, 502, answer.text);
			assert.match(answer.text, /query-router/);
		});
	});

	it('still passes a non-JSON table answer through as raw, so the write client classifies it by status', async () => {
		await routerBridge(TABLES_PATH, garbledResponse, async (base) => {
			const answer = await send(base, `/api/databases/${DB}/tables/tasks`, asA, post({ op: 'list' }));
			assert.equal(answer.status, 200, answer.text);
			assert.deepEqual(answer.body, { raw: GARBLED });
		});
	});

	it('passes a 409 whose body read failed through as 409, never as 502', async () => {
		await routerBridge(TABLES_PATH, conflictCutResponse, async (base) => {
			const answer = await send(base, `/api/databases/${DB}/tables/tasks`, asA, post({ op: 'list' }));
			assert.equal(answer.status, 409, answer.text);
			assert.notEqual(answer.status, 502, answer.text);
			assert.doesNotMatch(answer.text, /could not be read/i);
		});
	});
});
