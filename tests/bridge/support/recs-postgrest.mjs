/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   recs-postgrest.mjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * A strict PostgREST stand-in for the "For you" route.
 *
 * Every query the route may emit is a declared SHAPE (method, table, the
 * exact parameter names, and the exact value of each fixed parameter).
 * Anything else is recorded in `violations` AND thrown, so a query nobody
 * declared cannot pass unnoticed. The stub answers only the declared shapes;
 * a failing shape answers a fixed 500.
 *
 * Caveat: a faithful evaluator of only the declared shapes. It does not model
 * RLS, column types or PostgREST's error bodies.
 */

import assert from 'node:assert/strict';
import { createRecsHandler } from '../../../scripts/bridge-recs.mjs';

export const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
export const CONFIG = {
	baasUrl: 'http://baas.test',
	serviceKey: 'svc-key',
	allowedOrigin: '*',
	appSessionSecret: 'test-app-session-secret',
};

/** The champion the context answers: two factors, so the numbers are readable. */
export const MODEL = {
	id: 7,
	factors: 2,
	regularization: 0.05,
	alpha: 40,
	item_gram: [2, 0.5, 0.5, 2],
	event_weights: { like: 1, react: 1, comment: 2, share: 3, favorite: 2 },
};

const reply = (rows, status = 200) => ({
	ok: status < 400,
	status,
	text: async () => (rows === '' ? '' : JSON.stringify(rows)),
});

/** The ids of an `in.(a,b)` filter, or [] when the filter says nothing. */
function idsOf(value) {
	const inner = String(value ?? '').replace(/^in\.\((.*)\)$/, '$1');
	return inner.split(',').map((entry) => entry.trim()).filter(Boolean);
}

/** The value of an `eq.x` filter. */
function eqOf(value) {
	return String(value ?? '').replace(/^eq\./, '');
}

/** The users an `or=(blocked_id.eq.x,blocker_id.eq.y)` filter names. */
function usersOf(value) {
	const inner = String(value ?? '').replace(/^\((.*)\)$/, '$1');
	return inner.split(',')
		.map((clause) => eqOf(clause.trim().split('.').pop()))
		.filter(Boolean);
}

/** Today's queries. `logical` names the failure switch a test flips. */
const SHAPES = [
	{
		logical: 'context', method: 'POST', table: 'rpc/ai_rec_user_context',
		keys: [], fixed: {},
		run: (world, _p, body) => world.contexts?.[body.p_user] ?? world.context ?? { model: null },
	},
	{
		logical: 'nearest', method: 'POST', table: 'rpc/ai_rec_nearest',
		keys: [], fixed: {},
		run: (world) => world.nearest ?? [],
	},
	{
		logical: 'pages', method: 'GET', table: 'osionos_pages',
		keys: ['id', 'archived_at', 'select'],
		fixed: { archived_at: 'is.null', select: 'id,title,icon,workspace_id,owner_id,visibility,collaborators' },
		run: (world, p) => {
			const ids = new Set(idsOf(p.id));
			return (world.pages ?? []).filter((row) => ids.has(String(row.id)) && !row.archived_at);
		},
	},
	{
		logical: 'members', method: 'GET', table: 'osionos_workspace_members',
		keys: ['user_id', 'workspace_id', 'select'],
		fixed: { select: 'workspace_id' },
		run: (world, p) => {
			const ids = new Set(idsOf(p.workspace_id));
			const user = eqOf(p.user_id);
			return (world.members ?? []).filter((row) => String(row.user_id) === user && ids.has(String(row.workspace_id)));
		},
	},
	{
		logical: 'blocks', method: 'GET', table: 'osionos_user_blocks',
		keys: ['or', 'select'],
		fixed: { select: 'blocker_id,blocked_id' },
		run: (world, p) => {
			const users = new Set(usersOf(p.or));
			return (world.blocks ?? []).filter((row) => users.has(String(row.blocker_id)) || users.has(String(row.blocked_id)));
		},
	},
];

function matches(shape, method, table, params, prefer) {
	if (shape.method !== method || shape.table !== table) return false;
	const names = [...params.keys()].sort();
	if (JSON.stringify(names) !== JSON.stringify([...shape.keys].sort())) return false;
	if (shape.prefer !== undefined && shape.prefer !== prefer) return false;
	return Object.entries(shape.fixed).every(([name, value]) => params.get(name) === value);
}

/**
 * `world`: { context, contexts, nearest, pages, members, blocks }.
 * `failing`: logical names that answer 500.
 */
export function createRecsStub(world = {}, { failing = [] } = {}) {
	const store = { context: { model: null }, nearest: [], pages: [], members: [], blocks: [], ...world };
	const calls = [];
	const violations = [];
	const failures = new Set(failing);
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
			const message = `recs stub: undeclared query ${method} ${table}${parsed.search}`;
			violations.push(message);
			throw new Error(message);
		}
		if (failures.has(shape.logical)) return reply({ message: 'stub failure' }, 500);
		const params = Object.fromEntries(parsed.searchParams);
		return reply(shape.run(store, params, record.body, record.prefer));
	};
	return {
		fetchImpl,
		calls,
		violations,
		world: store,
		/** The tables the route read, in order. */
		tables: () => calls.map((call) => call.table),
	};
}

/**
 * One call to the "For you" route, as `userId`, through the real handler.
 * `token: null` sends no Authorization header at all.
 * Returns { status, body, text, handled }.
 */
export async function callRecs(stub, {
	method = 'GET',
	path = '/api/recs/for-you',
	query = '',
	userId = uid(1),
	token = 'Bearer test',
	env = { OSIONOS_RECS_FOR_YOU: '1' },
} = {}) {
	const handler = createRecsHandler({
		config: CONFIG,
		verifySession: () => ({ userId }),
		fetchImpl: stub.fetchImpl,
		env,
	});
	const request = {
		method,
		headers: token ? { authorization: token } : {},
	};
	const captured = {};
	const response = {
		writeHead: (status) => { captured.status = status; },
		end: (text) => { captured.text = text; captured.body = JSON.parse(text); },
	};
	const handled = await handler(new URL(`http://bridge.test${path}${query}`), request, response);
	assert.deepEqual(stub.violations, []);
	captured.handled = handled;
	return captured;
}
