/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   account-export-world.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The world of the account-export suites: the account handler mounted on its own server
 * (the export worker OFF; tests call `runner.tick()` themselves), over ONE fake fetch that
 * plays both PostgREST and the storage router. It keeps the export job table with the
 * partial unique index and the claim function, the data registry, the data tables and
 * an object store, and it logs every request.
 *
 * Caveat: the fake reads the owner from the minted JWT the way RLS would, but it does not
 * model RLS itself: only the export job table is filtered by the caller; a data table is
 * returned as filtered by the query, which is what the bridge's own filter proves.
 */

import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createAccountHandler } from '../../../scripts/bridge-account-mounts.mjs';
import { verifyAppSessionToken } from '../../../scripts/bridge-api.mjs';
import { createExportRunner } from '../../../scripts/bridge-account-export-runner.mjs';
import { createPg } from '../../../scripts/bridge-pg.mjs';
import { ACCOUNT_JWT_SECRET, accountConfig } from './account-world.mjs';

export const EXPORTS = 'osionos_account_exports';
export const AUDIT = 'osionos_bridge_audit_events';
const SERVICE_KEY = 'service-role-test-key';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function subjectOf(headers) {
	const token = String(headers?.Authorization ?? '').replace(/^Bearer /, '');
	if (token === SERVICE_KEY) return null;
	return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
}

function passes(row, key, expression) {
	const [operator, ...rest] = expression.split('.');
	const wanted = rest.join('.');
	if (operator === 'eq') return String(row[key]) === wanted;
	if (operator === 'neq') return String(row[key]) !== wanted;
	if (operator === 'gt') return String(row[key]) > wanted;
	if (operator === 'lt') return String(row[key]) < wanted;
	if (operator === 'not') return wanted === 'is.null' ? row[key] != null : true;
	throw new Error(`export fake: unsupported filter ${key}=${expression}`);
}

function orPasses(row, expression) {
	return expression.slice(1, -1).split(',').some((term) => {
		const [key, ...rest] = term.split('.');
		return passes(row, key, rest.join('.'));
	});
}

const CONTROL = new Set(['select', 'order', 'limit', 'offset']);

function select(rows, params, cap = Infinity) {
	let hits = rows.filter((row) => [...params].every(([key, value]) => CONTROL.has(key) || (key === 'or' ? orPasses(row, value) : passes(row, key, value))));
	const order = params.get('order');
	if (order) {
		const [column] = order.split(',')[0].split('.');
		hits = [...hits].sort((left, right) => (String(left[column]) < String(right[column]) ? -1 : 1) * (order.endsWith('.desc') ? -1 : 1));
	}
	const offset = Number(params.get('offset') ?? 0);
	hits = hits.slice(offset, offset + Math.min(cap, Number(params.get('limit') ?? hits.length)));
	const columns = (params.get('select') ?? '*').split(',');
	return hits.map((row) => (columns[0] === '*' ? { ...row } : Object.fromEntries(columns.filter((c) => c in row).map((c) => [c, row[c]]))));
}

/** The fake fetch and its state. `fail.audit`, `fail.putAfter` (n puts then 500), `fail.donePatch` and `fail.pageCap` (rows per response) are the switches. */
export function createExportStore({ exports = [], registry = [], data = {} } = {}) {
	const tables = new Map([[EXPORTS, exports.map((row) => ({ ...row }))], [AUDIT, []], ['osionos_account_data_map', registry], ...Object.entries(data)]);
	const store = { calls: [], objects: new Map(), puts: 0, buckets: 0, fail: {}, tables, order: [] };
	const open = (userId) => tables.get(EXPORTS).find((row) => row.user_id === userId && (row.status === 'queued' || row.status === 'running'));

	function postgrest(parsed, method, init) {
		const table = parsed.pathname.replace('/rest/v1/', '');
		const body = init.body ? JSON.parse(init.body) : undefined;
		if (table === 'rpc/osionos_account_export_claim') {
			const job = tables.get(EXPORTS).find((row) => row.status === 'queued');
			if (!job) return json([]);
			job.status = 'running';
			return json([{ id: job.id, user_id: job.user_id, format: job.format, requested_at: job.requested_at }]);
		}
		if (table === AUDIT && store.fail.audit) return json({ message: 'down' }, 500);
		if (table === AUDIT) store.order.push(`audit:${body.event_type}`);
		const rows = tables.get(table);
		if (!rows) return json({ message: `no table ${table}` }, 404);
		if (method === 'GET') {
			const owner = table === EXPORTS ? subjectOf(init.headers) : null;
			return json(select(owner ? rows.filter((row) => row.user_id === owner) : rows, parsed.searchParams, store.fail.pageCap));
		}
		if (method === 'POST') {
			if (table === EXPORTS && open(body.user_id)) return json({ code: '23505' }, 409);
			const row = table === EXPORTS ? { id: randomUUID(), status: 'queued', requested_at: new Date().toISOString(), ...body } : body;
			rows.push(row);
			if (table !== AUDIT) store.order.push(`insert:${table}`);
			return json([row], 201);
		}
		if (method === 'PATCH' && store.fail.donePatch && body.status === 'done') return json({ message: 'down' }, 500);
		if (method === 'PATCH') {
			for (const row of rows.filter((r) => [...parsed.searchParams].every(([k, v]) => passes(r, k, v)))) Object.assign(row, body);
			return new Response(null, { status: 204 });
		}
		throw new Error(`export fake: unsupported ${method} ${table}`);
	}

	function storage(parsed, method, init) {
		const [bucket, key = ''] = parsed.pathname.split('/').slice(4);
		if (parsed.pathname.includes('/bucket/')) {
			store.buckets += 1;
			store.order.push('bucket');
			return json({});
		}
		const name = `${bucket}/${decodeURIComponent(key)}`;
		if (method === 'PUT') {
			store.puts += 1;
			store.order.push('put');
			if (store.fail.putAfter !== undefined && store.puts > store.fail.putAfter) return json({ message: 'boom' }, 500);
			store.objects.set(name, { owner: init.headers['x-user-id'], type: init.headers['content-type'], buffer: Buffer.from(init.body) });
			return json({});
		}
		store.order.push(method.toLowerCase());
		const object = store.objects.get(name);
		if (method === 'DELETE') { store.objects.delete(name); return json({}); }
		return object ? new Response(object.buffer, { status: 200, headers: { 'content-type': object.type } }) : json({}, 404);
	}

	store.fetchImpl = async (url, init = {}) => {
		const parsed = new URL(String(url));
		const method = init.method ?? 'GET';
		store.calls.push({ method, path: parsed.pathname, search: parsed.search, headers: init.headers });
		return parsed.pathname.startsWith('/rest/v1/') ? postgrest(parsed, method, init) : storage(parsed, method, init);
	};
	return store;
}

/** The mounted handler on a server, plus a runner that shares the same fake. */
export async function startExportWorld(t, { kv, store = createExportStore(), clock = { at: Date.now() } } = {}) {
	const config = accountConfig();
	const env = { JWT_SECRET: ACCOUNT_JWT_SECRET, STORAGE_ROUTER_URL: 'https://storage.local/storage/v1' };
	const pg = createPg({ config, env, fetchImpl: store.fetchImpl });
	const handler = createAccountHandler({
		config, pg, kv, verifySession: verifyAppSessionToken, env, fetchImpl: store.fetchImpl,
		exportFetch: store.fetchImpl, exportEnv: env, exportNow: () => clock.at, exportRunner: false,
	});
	const server = createServer(async (request, response) => {
		const url = new URL(request.url ?? '/', 'http://localhost');
		if (!(await handler(url, request, response))) {
			response.writeHead(404, { 'content-type': 'application/json' });
			response.end('{}');
		}
	});
	await new Promise((done) => server.listen(0, '127.0.0.1', done));
	t?.after(() => new Promise((done) => server.close(done)));
	const runner = createExportRunner({ pg, env, fetchImpl: store.fetchImpl, now: () => clock.at });
	return { base: `http://127.0.0.1:${server.address().port}`, config, store, runner, clock, pg, env };
}
