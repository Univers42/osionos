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
// The report route (POST /api/social/reports, bridge-reports.mjs) added its own shapes:
// the reports table (list, duplicate read, insert) and the subject tables it resolves
// (people, messages, channels, channel/workspace members, workspaces, pages, comments).
// `conflictInsert` answers the insert with PostgREST's 409/23505 (the unique index won).
// Caveat: a faithful evaluator of only the declared shapes. It does not model RLS, column
// types or PostgREST's error bodies, and a failing shape answers a fixed 500.

import assert from 'node:assert/strict';
import { createSocialHandler } from '../../../scripts/bridge-social.mjs';

export const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
export const CONFIG = { baasUrl: 'http://baas.test', serviceKey: 'svc-key', allowedOrigin: '*' };
// Derived from the peer, not from insertion order, so a reordered batch yields the same ids.
export const newEdgeId = (peer) => `0e${peer.slice(2)}`;
export const NEW_EDGE_CREATED_AT = '2026-10-19T12:00:00.000Z';
export const NEW_REPORT_CREATED_AT = '2026-10-22T12:00:00.000Z';
const EMBED_SELECT = 'user_id,workspace_id,workspace:osionos_workspaces!workspace_id(members:osionos_workspace_members!workspace_id(user_id))';
const UUID_LIST = /^in\.\(([^)]*)\)$/;
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

/** The stored osionos_user_reports row an insert creates. */
function insertReport(world, body) {
	const row = { id: uid(900 + world.reports.length), status: 'open', created_at: NEW_REPORT_CREATED_AT, ...body };
	world.reports.push(row);
	return row;
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
	{
		logical: 'insert', method: 'POST', table: 'osionos_connections', keys: ['on_conflict'], fixed: { on_conflict: 'pair_key' }, prefer: 'resolution=ignore-duplicates,return=representation',
		run: (world, _p, body, prefer) => insertEdges(world, body, prefer),
	},
	// ── the report route (bridge-reports.mjs) and the subjects it resolves ──
	{
		logical: 'report_list', method: 'GET', table: 'osionos_user_reports',
		keys: ['reporter_id', 'select', 'order', 'limit'],
		fixed: { select: '*', order: 'created_at.desc', limit: '100' },
		run: (world, p) => world.reports
			.filter((row) => row.reporter_id === p.reporter_id.slice(3))
			.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
	},
	{
		logical: 'report_duplicate', method: 'GET', table: 'osionos_user_reports',
		keys: ['reporter_id', 'subject_kind', 'subject_id', 'select', 'limit'],
		fixed: { select: '*', limit: '1' },
		run: (world, p) => world.reports.filter((row) =>
			row.reporter_id === p.reporter_id.slice(3)
			&& row.subject_kind === p.subject_kind.slice(3)
			&& row.subject_id === p.subject_id.slice(3)),
	},
	{
		logical: 'report_insert', method: 'POST', table: 'osionos_user_reports', keys: [], fixed: {}, prefer: 'return=representation',
		run: (world, _p, body) => [insertReport(world, body)],
	},
	{
		logical: 'people_one', method: 'GET', table: 'osionos_people_directory',
		keys: ['user_id', 'select', 'limit'],
		fixed: { select: 'user_id', limit: '1' },
		run: (world, p) => world.people.filter((row) => row.user_id === p.user_id.slice(3)),
	},
	{
		logical: 'message', method: 'GET', table: 'osionos_messages',
		keys: ['id', 'select', 'limit'],
		fixed: { select: 'id,author_id,channel_id', limit: '1' },
		run: (world, p) => world.messages.filter((row) => row.id === p.id.slice(3)),
	},
	{
		logical: 'channel', method: 'GET', table: 'osionos_channels',
		keys: ['id', 'select', 'limit'],
		fixed: { select: '*', limit: '1' },
		run: (world, p) => world.channels.filter((row) => row.id === p.id.slice(3)),
	},
	{
		logical: 'channel_member', method: 'GET', table: 'osionos_channel_members',
		keys: ['channel_id', 'user_id', 'select', 'limit'],
		fixed: { select: 'role', limit: '1' },
		run: (world, p) => world.channelMembers.filter((row) => row.channel_id === p.channel_id.slice(3) && row.user_id === p.user_id.slice(3)),
	},
	{
		logical: 'workspace_member', method: 'GET', table: 'osionos_workspace_members',
		keys: ['workspace_id', 'user_id', 'select', 'limit'],
		fixed: { select: 'role,permissions', limit: '1' },
		run: (world, p) => world.members
			.filter((row) => row.workspace_id === p.workspace_id.slice(3) && row.user_id === p.user_id.slice(3))
			.map((row) => ({ role: row.role ?? 'member', permissions: row.permissions ?? [] })),
	},
	{
		logical: 'member_workspaces', method: 'GET', table: 'osionos_workspace_members',
		keys: ['user_id', 'workspace_id', 'select'],
		fixed: { select: 'workspace_id' },
		run: (world, p) => {
			const wanted = new Set(idsOf(p.workspace_id));
			return world.members
				.filter((row) => row.user_id === p.user_id.slice(3) && wanted.has(row.workspace_id))
				.map((row) => ({ workspace_id: row.workspace_id }));
		},
	},
	{
		logical: 'workspace', method: 'GET', table: 'osionos_workspaces',
		keys: ['id', 'select', 'limit'],
		fixed: { select: 'id,owner_id,visibility', limit: '1' },
		run: (world, p) => world.workspaces.filter((row) => row.id === p.id.slice(3)),
	},
	{
		logical: 'page', method: 'GET', table: 'osionos_pages',
		keys: ['id', 'select', 'limit'],
		fixed: { select: 'id,workspace_id,owner_id,visibility,collaborators,archived_at', limit: '1' },
		run: (world, p) => world.pages.filter((row) => row.id === p.id.slice(3)),
	},
	{
		logical: 'feed_comment', method: 'GET', table: 'osionos_feed_comments',
		keys: ['id', 'select', 'limit'],
		fixed: { select: 'id,author_id,page_id', limit: '1' },
		run: (world, p) => world.feedComments.filter((row) => row.id === p.id.slice(3)),
	},
	{
		logical: 'page_comment', method: 'GET', table: 'osionos_page_comments',
		keys: ['id', 'select', 'limit'],
		fixed: { select: 'id,author_id,page_id', limit: '1' },
		run: (world, p) => world.pageComments.filter((row) => row.id === p.id.slice(3)),
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

/** `world`: { members, connections, blocks, people, … }. `failing`: logical names that answer 500. */
export function createSocialStub(world, { failing = [], leakAnchor = false, conflictInsert = false } = {}) {
	const store = {
		members: [], people: [], reports: [], messages: [], channels: [], channelMembers: [],
		workspaces: [], pages: [], feedComments: [], pageComments: [], ...world,
	};
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
		// The unique index caught the insert: the row is there, the insert still fails.
		if (shape.logical === 'report_insert' && conflictInsert) {
			insertReport(store, record.body);
			return reply({ code: '23505', message: 'duplicate key value violates unique constraint "osionos_user_reports_reporter_subject_key"' }, 409);
		}
		const params = Object.fromEntries(parsed.searchParams);
		const rows = shape.run(store, params, record.body, record.prefer, { leakAnchor });
		return reply(rows, method === 'POST' ? 201 : 200);
	};
	return { fetchImpl, calls, violations, world: store, posts: () => calls.filter((call) => call.method === 'POST') };
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

/** A POST request the bridge can read the JSON body of. */
function jsonRequest(payload) {
	return {
		method: 'POST',
		headers: { authorization: 'Bearer test' },
		async *[Symbol.asyncIterator]() { yield JSON.stringify(payload); },
	};
}

/**
 * POST /api/social/reports as `userId` through the real handler.
 * Returns { status, body, text } — `text` is the raw answer, so two answers can be
 * compared byte for byte (no existence oracle).
 */
export async function postReport(stub, userId, payload) {
	const handler = createSocialHandler({ config: CONFIG, verifySession: () => ({ userId }), fetchImpl: stub.fetchImpl, env: {} });
	const captured = {};
	const response = { writeHead: (status) => { captured.status = status; }, end: (text) => { captured.text = text; captured.body = JSON.parse(text); } };
	await handler(new URL('http://bridge.test/api/social/reports'), jsonRequest(payload), response);
	assert.deepEqual(stub.violations, []);
	return captured;
}

/** GET /api/social/reports as `userId` through the real handler; returns { status, body, text }. */
export async function getReports(stub, userId) {
	const handler = createSocialHandler({ config: CONFIG, verifySession: () => ({ userId }), fetchImpl: stub.fetchImpl, env: {} });
	const request = { method: 'GET', headers: { authorization: 'Bearer test' } };
	const captured = {};
	const response = { writeHead: (status) => { captured.status = status; }, end: (text) => { captured.text = text; captured.body = JSON.parse(text); } };
	await handler(new URL('http://bridge.test/api/social/reports'), request, response);
	assert.deepEqual(stub.violations, []);
	return captured;
}
