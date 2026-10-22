/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   personalization-postgrest.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * A strict PostgREST stand-in for the personalization routes.
 *
 * Every query the routes may emit is a declared SHAPE (method, table, the
 * exact parameter names, and the exact value of each fixed parameter).
 * Anything else is recorded in `violations` AND thrown, so a query nobody
 * declared cannot pass unnoticed. The stub answers only the declared shapes;
 * a failing shape answers a fixed 500, and a missing one a fixed 404 — the
 * RPC that is not deployed yet.
 *
 * Caveat: a faithful evaluator of only the declared shapes. It does not model
 * RLS, column types or PostgREST's error bodies.
 */

import assert from 'node:assert/strict';
import { createPersonalizationHandler } from '../../../scripts/bridge-personalization.mjs';

export const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
export const CONFIG = { baasUrl: 'http://baas.test', serviceKey: 'svc-key', allowedOrigin: '*' };

const reply = (rows, status = 200) => ({ ok: status < 400, status, text: async () => (rows === '' ? '' : JSON.stringify(rows)) });

/** The stored switch of one user: the row the upsert writes. */
function upsertSetting(world, body) {
	const existing = world.settings.find((row) => row.user_id === body.user_id);
	if (existing) {
		Object.assign(existing, body);
		return existing;
	}
	const row = { ...body };
	world.settings.push(row);
	return row;
}

/** The erasure: the rows of that user are gone, and the count is the answer. */
function eraseEvents(world, userId) {
	const before = world.events.length;
	world.events = world.events.filter((row) => row.user_id !== userId);
	return before - world.events.length;
}

/** Today's queries. `logical` names the failure switch a test flips. */
const SHAPES = [
	{
		logical: 'setting', method: 'GET', table: 'ai_personalization_settings',
		keys: ['user_id', 'select', 'limit'],
		fixed: { select: 'capture_explicit,beacon_consent', limit: '1' },
		run: (world, p) => world.settings.filter((row) => row.user_id === p.user_id.slice(3)),
	},
	{
		logical: 'setting_write', method: 'POST', table: 'ai_personalization_settings',
		keys: ['on_conflict'], fixed: { on_conflict: 'user_id' },
		prefer: 'resolution=merge-duplicates,return=representation',
		run: (world, _p, body) => [upsertSetting(world, body)],
	},
	{
		logical: 'export', method: 'POST', table: 'rpc/ai_export_user',
		keys: [], fixed: {},
		run: (world, _p, body) => world.events.filter((row) => row.user_id === body.p_user),
	},
	{
		// The vectors derived from the user: the JSONB object the database answers.
		logical: 'rec_export', method: 'POST', table: 'rpc/ai_rec_export_user',
		keys: [], fixed: {},
		run: (world) => world.derived,
	},
	{
		logical: 'erase', method: 'POST', table: 'rpc/ai_erase_user',
		keys: [], fixed: {},
		run: (world, _p, body) => eraseEvents(world, body.p_user),
	},
];

function matches(shape, method, table, params, prefer) {
	if (shape.method !== method || shape.table !== table) return false;
	const names = [...params.keys()].sort();
	if (JSON.stringify(names) !== JSON.stringify([...shape.keys].sort())) return false;
	if (shape.prefer !== undefined && shape.prefer !== prefer) return false;
	return Object.entries(shape.fixed).every(([name, value]) => params.get(name) === value);
}

/** `world`: { settings, events, derived }. `failing`: logical names that answer 500. */
export function createPersonalizationStub(world = {}, { failing = [], missing = [] } = {}) {
	const store = { settings: [], events: [], derived: { user_vectors: [], as_item: [] }, ...world };
	const calls = [];
	const violations = [];
	const failures = new Set(failing);
	// `missing`: the function is NOT deployed yet — PostgREST answers 404 (PGRST202).
	const absent = new Set(missing);
	const fetchImpl = async (url, init = {}) => {
		const parsed = new URL(url);
		const method = init.method ?? 'GET';
		const table = parsed.pathname.replace('/rest/v1/', '');
		const record = {
			method,
			table,
			query: parsed.search,
			body: init.body === undefined ? undefined : JSON.parse(init.body),
			prefer: init.headers?.Prefer ?? '',
		};
		calls.push(record);
		const shape = SHAPES.find((candidate) => matches(candidate, method, table, parsed.searchParams, record.prefer));
		if (!shape) {
			const message = `personalization stub: undeclared query ${method} ${table}${parsed.search}`;
			violations.push(message);
			throw new Error(message);
		}
		if (absent.has(shape.logical)) return reply({ message: 'stub: function not found' }, 404);
		if (failures.has(shape.logical)) return reply({ message: 'stub failure' }, 500);
		const params = Object.fromEntries(parsed.searchParams);
		const rows = shape.run(store, params, record.body, record.prefer);
		return reply(rows, method === 'POST' ? 201 : 200);
	};
	return {
		fetchImpl,
		calls,
		violations,
		world: store,
		/** Every write the routes made, in order. */
		writes: () => calls.filter((call) => call.method === 'POST'),
	};
}

/**
 * One call to the personalization routes, as `userId`, through the real
 * handler. `token: null` sends no Authorization header at all.
 * Returns { status, body, text }.
 */
export async function callPersonalization(stub, {
	method = 'GET',
	path = '/api/personalization',
	userId = uid(1),
	body,
	token = 'Bearer test',
} = {}) {
	const handler = createPersonalizationHandler({
		config: CONFIG,
		verifySession: () => ({ userId }),
		fetchImpl: stub.fetchImpl,
	});
	const request = {
		method,
		headers: token ? { authorization: token } : {},
		...(body === undefined ? {} : { async *[Symbol.asyncIterator]() { yield JSON.stringify(body); } }),
	};
	const captured = {};
	const response = {
		writeHead: (status) => { captured.status = status; },
		end: (text) => { captured.text = text; captured.body = JSON.parse(text); },
	};
	const handled = await handler(new URL(`http://bridge.test${path}`), request, response);
	assert.deepEqual(stub.violations, []);
	captured.handled = handled;
	return captured;
}
