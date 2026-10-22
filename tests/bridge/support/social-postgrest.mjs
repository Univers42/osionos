/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   social-postgrest.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A strict PostgREST stand-in for GET /api/connections. Every query the route may emit is
// a declared SHAPE (method, table, the exact parameter names, and the exact value of each
// fixed parameter). Anything else is recorded in `violations` AND thrown: the route swallows
// its own errors, so a throw alone could be hidden and a test would pass on a query nobody
// declared. getConnections() asserts `violations` is empty.
// The route is a READ: it never posts a colleague edge and never reads the co-member embed
// (the database creates those edges when a member joins a workspace).
// Caveat: a faithful evaluator of only the declared shapes. It does not model RLS, column
// types or PostgREST's error bodies, and a failing shape answers a fixed 500.

import assert from 'node:assert/strict';
import { createSocialHandler } from '../../../scripts/bridge-social.mjs';

export const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
export const CONFIG = { baasUrl: 'http://baas.test', serviceKey: 'svc-key', allowedOrigin: '*' };
const UUID_LIST = /^in\.\((.*)\)$/;
export const BLOCK_CREATED_AT = '2026-10-19T12:00:00.000Z';
const pairKey = (left, right) => [left, right].sort((a, b) => a.localeCompare(b)).join(':');
const OR_EDGES = /^\(requester_id\.eq\.([^,]+),addressee_id\.eq\.([^,)]+)\)$/;
const OR_BLOCKS = /^\(blocked_id\.eq\.([^,]+),blocker_id\.eq\.([^,)]+)\)$/;
const reply = (rows, status = 200) => ({ ok: status < 400, status, text: async () => (rows === '' ? '' : JSON.stringify(rows)) });

/** The ids of an `in.(…)` filter: the bridge quotes them, so the quotes come off here. */
function idsOf(expr) {
	const match = UUID_LIST.exec(expr);
	if (!match) return [];
	return match[1].split(',').map((item) => item.replace(/^"(.*)"$/, '$1'));
}

function edgesOf(world, userId) {
	return world.connections.filter((row) => row.requester_id === userId || row.addressee_id === userId);
}

/** Today's queries. `logical` names the failure switch a test flips. */
const SHAPES = [
	{
		logical: 'edges', method: 'GET', table: 'osionos_connections', keys: ['or', 'select', 'order'],
		fixed: { select: '*', order: 'created_at.desc' },
		run: (world, p) => edgesOf(world, OR_EDGES.exec(p.or)[1]).sort((a, b) => b.created_at.localeCompare(a.created_at)),
	},
	{
		logical: 'edges', method: 'GET', table: 'osionos_connections', keys: ['or', 'select', 'order', 'status'],
		fixed: { select: '*', order: 'created_at.desc' },
		run: (world, p) => edgesOf(world, OR_EDGES.exec(p.or)[1]).filter((row) => `eq.${row.status}` === p.status).sort((a, b) => b.created_at.localeCompare(a.created_at)),
	},
	{
		logical: 'blocks', method: 'GET', table: 'osionos_user_blocks', keys: ['or', 'select'],
		fixed: { select: 'blocker_id,blocked_id' },
		run: (world, p) => {
			const viewer = OR_BLOCKS.exec(p.or)[1];
			return world.blocks.filter((row) => row.blocked_id === viewer || row.blocker_id === viewer);
		},
	},
	{
		logical: 'people', method: 'GET', table: 'osionos_people_directory', keys: ['user_id', 'select'],
		fixed: { select: 'user_id,display_name,profile' },
		run: (world, p) => {
			const wanted = new Set(idsOf(p.user_id));
			return world.people.filter((row) => wanted.has(row.user_id));
		},
	},
	// Block management (P5-4-a).
	{
		logical: 'blocksList', method: 'GET', table: 'osionos_user_blocks', keys: ['blocker_id', 'select', 'order'],
		fixed: { select: 'blocked_id,reason,created_at', order: 'created_at.desc' },
		run: (world, p) => world.blocks
			.filter((row) => row.blocker_id === p.blocker_id.replace('eq.', ''))
			.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
			.map((row) => ({ blocked_id: row.blocked_id, reason: row.reason ?? null, created_at: row.created_at ?? null })),
	},
	{
		logical: 'blocksInsert', method: 'POST', table: 'osionos_user_blocks', keys: ['on_conflict'], fixed: { on_conflict: 'blocker_id,blocked_id' }, prefer: 'resolution=merge-duplicates,return=minimal',
		run: (world, _p, body) => {
			const row = { blocker_id: body.blocker_id, blocked_id: body.blocked_id, reason: body.reason ?? null, created_at: BLOCK_CREATED_AT };
			const existing = world.blocks.find((r) => r.blocker_id === row.blocker_id && r.blocked_id === row.blocked_id);
			if (existing) Object.assign(existing, row);
			else world.blocks.push(row);
			return '';
		},
	},
	{
		logical: 'blocksReadback', method: 'GET', table: 'osionos_user_blocks', keys: ['blocker_id', 'blocked_id', 'select'],
		fixed: { select: 'blocked_id,reason,created_at' },
		run: (world, p) => {
			const blocker = p.blocker_id.replace('eq.', '');
			const blocked = p.blocked_id.replace('eq.', '');
			return world.blocks
				.filter((row) => row.blocker_id === blocker && row.blocked_id === blocked)
				.map((row) => ({ blocked_id: row.blocked_id, reason: row.reason ?? null, created_at: row.created_at ?? null }));
		},
	},
	{
		logical: 'blocksDelete', method: 'DELETE', table: 'osionos_user_blocks', keys: ['blocker_id', 'blocked_id'], fixed: {}, prefer: 'return=minimal',
		run: (world, p) => {
			const blocker = p.blocker_id.replace('eq.', '');
			const blocked = p.blocked_id.replace('eq.', '');
			world.blocks = world.blocks.filter((row) => !(row.blocker_id === blocker && row.blocked_id === blocked));
			return '';
		},
	},
	{
		logical: 'connectionsByPair', method: 'GET', table: 'osionos_connections', keys: ['pair_key', 'select'],
		fixed: { select: 'id,status' },
		run: (world, p) => {
			const pair = decodeURIComponent(p.pair_key.replace('eq.', ''));
			return world.connections
				.filter((row) => pairKey(row.requester_id, row.addressee_id) === pair)
				.map((row) => ({ id: row.id, status: row.status }));
		},
	},
	{
		logical: 'connectionsPatchById', method: 'PATCH', table: 'osionos_connections', keys: ['id'], fixed: {}, prefer: 'return=representation',
		run: (world, p, body) => {
			const id = p.id.replace('eq.', '');
			const matching = world.connections.filter((row) => row.id === id);
			for (const row of matching) Object.assign(row, body);
			return matching.map((row) => ({ id: row.id, status: row.status }));
		},
	},
	// Block route's edge update (and any pair_key patch).
	{
		logical: 'connectionsPatchByPair', method: 'PATCH', table: 'osionos_connections', keys: ['pair_key'], fixed: {}, prefer: 'resolution=merge-duplicates,return=minimal',
		run: (world, p, body) => {
			const pair = decodeURIComponent(p.pair_key.replace('eq.', ''));
			const matching = world.connections.filter((row) => pairKey(row.requester_id, row.addressee_id) === pair);
			for (const row of matching) Object.assign(row, body);
			return matching.map((row) => ({ id: row.id, status: row.status }));
		},
	},
];

function matches(shape, method, table, params, prefer) {
	if (shape.method !== method || shape.table !== table) return false;
	const names = [...params.keys()].sort();
	if (JSON.stringify(names) !== JSON.stringify([...shape.keys].sort())) return false;
	if (shape.prefer !== undefined && shape.prefer !== prefer) return false;
	if (!Object.entries(shape.fixed).every(([name, value]) => params.get(name) === value)) return false;
	return shape.valid === undefined || shape.valid(Object.fromEntries(params));
}

/** `world`: { connections, blocks, people }. `failing`: logical names that answer 500. */
export function createSocialStub(world, { failing = [] } = {}) {
	const calls = [];
	const violations = [];
	const failures = new Set(failing);
	const fetchImpl = async (url, init = {}) => {
		const parsed = new URL(url);
		const method = init.method ?? 'GET';
		const table = parsed.pathname.replace('/rest/v1/', '');
		const record = { method, table, query: parsed.search, body: init.body === undefined ? undefined : JSON.parse(init.body), prefer: init.headers?.Prefer ?? '' };
		calls.push(record);
		const shape = SHAPES.find((candidate) => matches(candidate, method, table, parsed.searchParams, record.prefer));
		if (!shape) {
			const message = `social stub: undeclared query ${method} ${table}${parsed.search}`;
			violations.push(message);
			throw new Error(message);
		}
		if (failures.has(shape.logical)) return reply({ message: 'stub failure' }, 500);
		const params = Object.fromEntries(parsed.searchParams);
		const rows = shape.run(world, params, record.body, record.prefer);
		return reply(rows, method === 'POST' ? 201 : 200);
	};
	return { fetchImpl, calls, violations, world, posts: () => calls.filter((call) => call.method === 'POST') };
}

/** GET /api/connections{query} as `userId` through the real handler; returns { status, body }. */
export async function getConnections(stub, userId, query = '', kv = null) {
	const handler = createSocialHandler({ config: CONFIG, verifySession: () => ({ userId }), fetchImpl: stub.fetchImpl, env: {}, kv });
	const request = { method: 'GET', headers: { authorization: 'Bearer test' } };
	const captured = {};
	const response = { writeHead: (status) => { captured.status = status; }, end: (text) => { captured.body = JSON.parse(text); } };
	await handler(new URL(`http://bridge.test/api/connections${query}`), request, response);
	assert.deepEqual(stub.violations, []);
	return captured;
}

/** The edge shape the route answers with, for a stored row seen from `viewer`. */
export function expectedEdge(row, viewer, peers = {}, online = new Set()) {
	const outgoing = row.requester_id === viewer;
	const peer = outgoing ? row.addressee_id : row.requester_id;
	return {
		id: row.id,
		peer: { id: peer, name: peers[peer]?.name ?? 'Member', avatar: peers[peer]?.avatar ?? null, online: online.has(peer) },
		status: row.status,
		direction: outgoing ? 'outgoing' : 'incoming',
		introMessage: row.intro_message ?? null,
		source: row.source ?? 'manual',
		createdAt: row.created_at ?? null,
		respondedAt: row.responded_at ?? null,
	};
}
