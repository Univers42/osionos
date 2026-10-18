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
// fixed parameter). Anything else is recorded in `violations` AND thrown: the colleague
// sync swallows its own errors, so a throw alone could be hidden and a test would pass on
// a query nobody declared. getConnections() asserts `violations` is empty.
// Shapes were swapped in the commit that restructured the reads (the tests did not change):
// the members->workspace->members embed replaced the two member reads, and the unfiltered
// edges read replaced the sync's limit=1000 read. `leakAnchor` makes the embed answer every
// user's rows, as a dropped `user_id=eq.` anchor would.
// Caveat: a faithful evaluator of only the declared shapes. It does not model RLS, column
// types or PostgREST's error bodies, and a failing shape answers a fixed 500.

import assert from 'node:assert/strict';
import { createSocialHandler } from '../../../scripts/bridge-social.mjs';

export const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
export const CONFIG = { baasUrl: 'http://baas.test', serviceKey: 'svc-key', allowedOrigin: '*' };
// Derived from the peer, not from insertion order, so a reordered batch yields the same ids.
export const newEdgeId = (peer) => `0e${peer.slice(2)}`;
export const NEW_EDGE_CREATED_AT = '2026-10-19T12:00:00.000Z';
const EMBED_SELECT = 'user_id,workspace_id,workspace:osionos_workspaces!workspace_id(members:osionos_workspace_members!workspace_id(user_id))';
const UUID_LIST = /^in\.\(([^)]*)\)$/;
const OR_EDGES = /^\(requester_id\.eq\.([^,]+),addressee_id\.eq\.([^,)]+)\)$/;
const OR_BLOCKS = /^\(blocked_id\.eq\.([^,]+),blocker_id\.eq\.([^,)]+)\)$/;
const pairKey = (left, right) => [left, right].sort((a, b) => a.localeCompare(b)).join(':');
const reply = (rows, status = 200) => ({ ok: status < 400, status, text: async () => (rows === '' ? '' : JSON.stringify(rows)) });

function edgesOf(world, userId) {
	return world.connections.filter((row) => row.requester_id === userId || row.addressee_id === userId);
}

function insertEdges(world, rows, prefer) {
	const inserted = [];
	for (const row of rows) {
		const key = pairKey(row.requester_id, row.addressee_id);
		if (world.connections.some((existing) => pairKey(existing.requester_id, existing.addressee_id) === key)) continue;
		const stored = { id: newEdgeId(row.addressee_id), ...row, intro_message: null, created_at: NEW_EDGE_CREATED_AT };
		world.connections.push(stored);
		inserted.push(stored);
	}
	return prefer.includes('return=representation') ? inserted : '';
}

/** Today's queries. `logical` names the failure switch a test flips. */
const SHAPES = [
	{
		logical: 'members', method: 'GET', table: 'osionos_workspace_members',
		keys: ['user_id', 'select', 'limit', 'workspace.members.user_id', 'workspace.members.limit'],
		fixed: { select: EMBED_SELECT, limit: '200', 'workspace.members.limit': '500' },
		// The nested filter must exclude the same user the anchor names.
		valid: (p) => p['workspace.members.user_id'] === `neq.${p.user_id.slice(3)}`,
		run: (world, p, _body, _prefer, options) => {
			const anchors = world.members.filter((row) => options.leakAnchor || `eq.${row.user_id}` === p.user_id).slice(0, Number(p.limit));
			return anchors.map((row) => ({
				user_id: row.user_id,
				workspace_id: row.workspace_id,
				workspace: {
					members: world.members
						.filter((member) => member.workspace_id === row.workspace_id && `neq.${member.user_id}` !== p['workspace.members.user_id'])
						.slice(0, Number(p['workspace.members.limit']))
						.map(({ user_id }) => ({ user_id })),
				},
			}));
		},
	},
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
		fixed: { select: 'user_id,display_name,profile,last_seen_at' },
		run: (world, p) => {
			const wanted = new Set(UUID_LIST.exec(p.user_id)[1].split(','));
			return world.people.filter((row) => wanted.has(row.user_id));
		},
	},
	{
		logical: 'insert', method: 'POST', table: 'osionos_connections', keys: ['on_conflict'], fixed: { on_conflict: 'pair_key' }, prefer: 'resolution=ignore-duplicates,return=representation',
		run: (world, _p, body, prefer) => insertEdges(world, body, prefer),
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

/** `world`: { members, connections, blocks, people }. `failing`: logical names that answer 500. */
export function createSocialStub(world, { failing = [], leakAnchor = false } = {}) {
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
		const rows = shape.run(world, params, record.body, record.prefer, { leakAnchor });
		return reply(rows, method === 'POST' ? 201 : 200);
	};
	return { fetchImpl, calls, violations, world, posts: () => calls.filter((call) => call.method === 'POST') };
}

/** GET /api/connections{query} as `userId` through the real handler; returns { status, body }. */
export async function getConnections(stub, userId, query = '') {
	const handler = createSocialHandler({ config: CONFIG, verifySession: () => ({ userId }), fetchImpl: stub.fetchImpl, env: {} });
	const request = { method: 'GET', headers: { authorization: 'Bearer test' } };
	const captured = {};
	const response = { writeHead: (status) => { captured.status = status; }, end: (text) => { captured.body = JSON.parse(text); } };
	await handler(new URL(`http://bridge.test/api/connections${query}`), request, response);
	assert.deepEqual(stub.violations, []);
	return captured;
}

/** The edge shape the route answers with, for a stored row seen from `viewer`. */
export function expectedEdge(row, viewer, peers = {}) {
	const outgoing = row.requester_id === viewer;
	const peer = outgoing ? row.addressee_id : row.requester_id;
	return {
		id: row.id,
		peer: { id: peer, name: peers[peer]?.name ?? 'Member', avatar: peers[peer]?.avatar ?? null, online: false },
		status: row.status,
		direction: outgoing ? 'outgoing' : 'incoming',
		introMessage: row.intro_message ?? null,
		source: row.source ?? 'manual',
		createdAt: row.created_at ?? null,
		respondedAt: row.responded_at ?? null,
	};
}
