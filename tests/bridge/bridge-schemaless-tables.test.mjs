/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-schemaless-tables.test.mjs                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/16 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/16 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A redis mount answered /schema with no tables, so its rows could not be opened
// (2026-11-16: 34 seeded rows in "MDW · Redis", none reachable from the app).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { configFromEnv, createBridgeServer, signAppSessionToken } from '../../scripts/bridge-api.mjs';
import { inferColumns, linkedTablesSchema } from '../../scripts/bridge-schemaless-tables.mjs';

const userId = '5cc30a3f-87e4-471d-b795-c936723081ee';
const workspaceId = 'e6f8f7f4-add7-473c-9e61-f8f20802ae91';
const dbId = '06f1603f-662e-4120-a62d-e605e23c2fe9';
const rowsByTable = {
	mdw_churn: [{ id: 'churn-001', customer: 'Acme', mrr: '120' }, { id: 'churn-002', customer: 'Initech', reason: 'price' }],
	mdw_ref_color: [{ id: 'color-001', name: 'red' }],
};

function schemalessFetch(reads) {
	return async (input, init) => {
		const url = String(input);
		if (url === `http://query-router.local/${dbId}/schema`) {
			return Response.json({ error: 'unsupported_capability', message: 'unsupported_capability: introspect' }, { status: 422 });
		}
		const table = url.match(/\/tables\/([^/?]+)$/)?.[1];
		if (url.startsWith('http://query-router.local') && table) {
			reads.push({ table, body: JSON.parse(init.body) });
			return Response.json({ rows: rowsByTable[table] ?? [] });
		}
		if (url.includes('osionos_workspace_databases')) {
			return Response.json([{ workspace_id: workspaceId, db_id: dbId, engine: 'redis', label: 'MDW · Redis', tables: ['mdw_churn', 'mdw_ref_color', '../etc'] }]);
		}
		return Response.json([]);
	};
}

async function readSchema(reads) {
	const config = configFromEnv({
		OSIONOS_SESSION_CUTOFFS: 'off',
		OSIONOS_SESSION_RECORDS: 'off',
		OSIONOS_APP_URL: 'http://localhost:3001',
		OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
		OSIONOS_BAAS_URL: 'http://baas.local',
		KONG_SERVICE_API_KEY: 'service-role-test-key',
		OSIONOS_QUERY_ROUTER_URL: 'http://query-router.local',
		OSIONOS_BAAS_API_KEY: 'tenant-api-key',
	});
	const server = createBridgeServer({ config, fetchImpl: schemalessFetch(reads) });
	await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
	const { token } = signAppSessionToken({ payload: { subject: userId, provider: 'test' }, workspace: { _id: workspaceId }, config });
	try {
		const response = await fetch(`http://127.0.0.1:${server.address().port}/api/databases/${dbId}/schema`, {
			headers: { authorization: `Bearer ${token}` },
		});
		return { status: response.status, body: await response.json() };
	} finally {
		await new Promise((resolveClose) => server.close(resolveClose));
	}
}

describe('schema of a mount whose engine cannot introspect', () => {
	it('lists the tables the workspace link names, with columns sampled from rows', async () => {
		const reads = [];
		const { status, body } = await readSchema(reads);
		assert.equal(status, 200);
		assert.deepEqual(body.capabilities, { introspect: false });
		assert.deepEqual(body.tables.map((t) => t.name), ['mdw_churn', 'mdw_ref_color', '../etc']);
		const churn = body.tables[0];
		assert.deepEqual(churn.columns.map((c) => c.name), ['id', 'customer', 'mrr', 'reason']);
		assert.deepEqual(churn.primary_key, ['id']);
		assert.ok(churn.columns.every((c) => c.inferred && c.normalized_type === 'text'));
		// The unsafe name is never sent upstream: it lists with no columns.
		assert.deepEqual(body.tables[2].columns, []);
		assert.deepEqual(reads.map((r) => r.table).sort(), ['mdw_churn', 'mdw_ref_color']);
		assert.ok(reads.every((r) => r.body.op === 'list' && r.body.limit === 20));
	});
});

describe('inferColumns', () => {
	it('types a column by its first non-null value', () => {
		const columns = inferColumns([{ a: null, b: 1, c: true }, { a: 2.5, b: 'x', d: { k: 1 } }]);
		assert.deepEqual(columns.map((c) => [c.name, c.normalized_type]), [['a', 'float'], ['b', 'integer'], ['c', 'boolean'], ['d', 'json']]);
	});
});

describe('linkedTablesSchema', () => {
	it('keeps a table whose read fails, and drops duplicate or empty names', async () => {
		const tables = await linkedTablesSchema(['t1', 't1', '', 't2'], async (name) => {
			if (name === 't2') throw new Error('down');
			return [{ v: 1 }];
		});
		assert.deepEqual(tables.map((t) => [t.name, t.columns.length, t.primary_key]), [['t1', 1, []], ['t2', 0, []]]);
	});
});
