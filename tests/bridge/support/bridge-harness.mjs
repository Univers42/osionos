/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-harness.mjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// HTTP harness for the bridge's page-ACL tests: an in-memory PostgREST, the query-router
// record read, session tokens for two members of one team workspace, and a server runner.
// Every request is logged so a test can prove a call did — or did not — happen.
// Ponytail: eq/in/gt compare case-insensitively (right for uuid columns, wrong for text
// columns differing only by case); `order` is honoured only as `id.asc`, every other value
// is ignored (insertion order); wfts is a substring match over title+content, not stemming.
// Unknown operators throw, so a new query shape fails the test instead of silently
// matching every row.
// Ponytail: every GET whose `select` contains an embed goes to the strict embed stub
// (embed-postgrest.mjs), which honours `updated_at.desc` and throws on any other order.
// Every mock world gets a synthesized `osionos_workspaces {id}` row, so a "workspace row
// missing" case cannot be written through this harness.

import { randomUUID } from 'node:crypto';
import { isEmbedRead, readEmbed } from './embed-postgrest.mjs';
import { configFromEnv, createBridgeServer, createUserSession, validateBridgePayload } from '../../../scripts/bridge-api.mjs';

const BAAS_URL = 'http://baas.local';
const QUERY_ROUTER_URL = 'http://query-router.local';
const RESERVED_PARAMS = new Set(['select', 'order', 'limit', 'on_conflict', 'columns', 'offset']);
const ALL_PERMISSIONS = ['create', 'read', 'update', 'delete', 'admin'];

export const IDS = {
	userA: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
	userB: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
	homeA: 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0',
	homeB: 'b0b0b0b0-2222-4222-8222-b0b0b0b0b0b0',
	team: 'c0c0c0c0-3333-4333-8333-c0c0c0c0c0c0',
	privateA: 'a1a1a1a1-1111-4111-8111-a1a1a1a1a1a1',
	sharedA: 'a2a2a2a2-1111-4111-8111-a2a2a2a2a2a2',
	memoA: 'a3a3a3a3-1111-4111-8111-a3a3a3a3a3a3',
	sharedMemoA: 'a4a4a4a4-1111-4111-8111-a4a4a4a4a4a4',
	pageB: 'b1b1b1b1-2222-4222-8222-b1b1b1b1b1b1',
	missing: 'dddddddd-4444-4444-8444-dddddddddddd',
};
export const SECRET = 'A-SECRET-7f3c';

function jsonResponse(value, status = 200) {
	return new Response(value === undefined ? null : JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function sameText(value, text) {
	return value != null && String(value).toLowerCase() === String(text).toLowerCase();
}

function matchesFilter(row, key, expr) {
	if (key === 'search_doc' && expr.startsWith('wfts(english).')) {
		const needle = expr.slice('wfts(english).'.length).replaceAll('"', '').toLowerCase();
		return `${row.title ?? ''} ${JSON.stringify(row.content ?? [])}`.toLowerCase().includes(needle);
	}
	if (expr === 'is.null') return row[key] == null;
	if (expr.startsWith('eq.')) return sameText(row[key], expr.slice(3));
	if (expr.startsWith('gt.')) return String(row[key] ?? '').toLowerCase() > expr.slice(3).toLowerCase();
	if (expr.startsWith('in.(') && expr.endsWith(')')) return expr.slice(4, -1).split(',').some((item) => sameText(row[key], item));
	throw new Error(`postgrest mock: unsupported filter ${key}=${expr}`);
}

function matchingRows(rows, params) {
	return rows.filter((row) => [...params].every(([key, expr]) => RESERVED_PARAMS.has(key) || matchesFilter(row, key, expr)));
}

function project(row, select) {
	if (!select || select === '*') return { ...row };
	return Object.fromEntries(select.split(',').filter((key) => Object.hasOwn(row, key)).map((key) => [key, row[key]]));
}

function readRows(rows, params) {
	const found = matchingRows(rows, params).map((row) => project(row, params.get('select')));
	// `id.asc` (a keyset scan) sorts by id before the limit; the comparison is the raw
	// string order `gt.` uses, so the cursor and the page order agree the way Postgres' uuid
	// order does. Every other `order` stays ignored, as before.
	const ordered = params.get('order') === 'id.asc'
		? [...found].sort((left, right) => String(left.id).toLowerCase() < String(right.id).toLowerCase() ? -1 : String(left.id).toLowerCase() > String(right.id).toLowerCase() ? 1 : 0)
		: found;
	return params.has('limit') ? ordered.slice(0, Number(params.get('limit'))) : ordered;
}

function upsertRows(rows, body, params, prefer) {
	const conflictKeys = (params.get('on_conflict') ?? 'id').split(',');
	const written = [];
	for (const item of Array.isArray(body) ? body : [body]) {
		const row = { id: randomUUID(), ...item };
		const existing = rows.find((candidate) => conflictKeys.every((key) => sameText(candidate[key], row[key])));
		if (existing && prefer.includes('ignore-duplicates')) continue;
		if (existing && !prefer.includes('merge-duplicates')) return null;
		if (existing) Object.assign(existing, item);
		else rows.push(row);
		written.push(existing ?? row);
	}
	return written;
}

function writeRows(rows, method, params, body, prefer) {
	if (method === 'POST') return upsertRows(rows, body, params, prefer);
	const hits = matchingRows(rows, params);
	if (method === 'PATCH') hits.forEach((row) => Object.assign(row, body));
	if (method === 'DELETE') hits.forEach((row) => rows.splice(rows.indexOf(row), 1));
	return hits;
}

function workspaceRpc(body) {
	return (body.p_workspace_ids ?? []).map((workspaceId) => ({
		workspace_id: workspaceId, owner_id: body.p_user_id, workspace_name: 'Home', workspace_slug: 'home',
		workspace_settings: { plan: 'Bridge' }, workspace_role: 'owner', permissions: ALL_PERMISSIONS,
	}));
}

/**
 * `realWorkspaceRpc`: the function answers from the seeded osionos_workspace_members rows —
 * one entry per requested id the user is a member of, so a workspace the token lists but
 * nobody is a member of stays empty and a viewer stays a viewer.
 */
function workspaceMemberRpc(body, table) {
	const members = table('osionos_workspace_members');
	return (body.p_workspace_ids ?? [])
		.map((workspaceId) => members.find((member) => sameText(member.user_id, body.p_user_id) && sameText(member.workspace_id, workspaceId)))
		.filter((member) => member !== undefined)
		.map((member) => ({
			workspace_id: member.workspace_id, owner_id: body.p_user_id, workspace_name: 'Home', workspace_slug: 'home',
			workspace_settings: { plan: 'Bridge' }, workspace_role: member.role, permissions: member.permissions,
		}));
}

/** seed: { table: rows[] }, records: { 'dbId/table': rows[] }, failWhen(call) → { status, body } | null. */
export function createPostgrestMock(seed = {}, { records = {}, failWhen = () => null, realWorkspaceRpc = false } = {}) {
	const tables = new Map(Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => structuredClone(row))]));
	const table = (name) => tables.get(name) ?? tables.set(name, []).get(name);
	// The FKs of osionos_workspace_members / osionos_pages guarantee their workspace exists, so a
	// seed that names a workspace without a row gets one; a seeded workspace row is left as is.
	for (const name of ['osionos_workspace_members', 'osionos_pages']) {
		for (const row of table(name)) {
			if (row.workspace_id && !table('osionos_workspaces').some((workspace) => sameText(workspace.id, row.workspace_id))) table('osionos_workspaces').push({ id: row.workspace_id });
		}
	}
	const calls = [];
	const stubErrors = [];
	const outbound = [];
	async function fetchImpl(url, init = {}) {
		const parsed = new URL(String(url));
		const method = init.method ?? 'GET';
		const body = init.body ? JSON.parse(init.body) : undefined;
		if (parsed.origin === QUERY_ROUTER_URL) {
			const [, dbId, , tableName] = parsed.pathname.split('/');
			const [[column, value]] = Object.entries(body.filter);
			return jsonResponse((records[`${dbId}/${tableName}`] ?? []).filter((row) => sameText(row[column], value)));
		}
		if (parsed.origin !== BAAS_URL) {
			outbound.push(String(url));
			return jsonResponse({ message: 'outbound calls are not served by the mock' }, 503);
		}
		const name = parsed.pathname.replace('/rest/v1/', '');
		const prefer = String(init.headers?.Prefer ?? '');
		const call = { method, table: name, params: parsed.searchParams, body };
		calls.push(call);
		const failure = failWhen(call);
		if (failure) return jsonResponse(failure.body, failure.status);
		if (name === 'rpc/osionos_bridge_list_workspaces') {
			return jsonResponse(realWorkspaceRpc ? workspaceMemberRpc(body, table) : workspaceRpc(body));
		}
		if (method === 'GET' && isEmbedRead(parsed.searchParams)) {
			try {
				return jsonResponse(readEmbed(name, parsed.searchParams, table));
			} catch (error) {
				stubErrors.push(error.message);
				throw error;
			}
		}
		if (method === 'GET') return jsonResponse(readRows(table(name), parsed.searchParams));
		const written = writeRows(table(name), method, parsed.searchParams, body, prefer);
		if (!written) return jsonResponse({ code: '23505', message: 'duplicate key' }, 409);
		return prefer.includes('return=representation') ? jsonResponse(written, method === 'POST' ? 201 : 200) : new Response(null, { status: 204 });
	}
	return { fetchImpl, calls, outbound, stubErrors, rows: table, page: (id) => table('osionos_pages').find((row) => row.id === id) };
}

export function harnessConfig() {
	return configFromEnv({
		OSIONOS_APP_URL: 'http://localhost:3001',
		OSIONOS_BRIDGE_SHARED_SECRET: 'test-bridge-secret-that-is-long-enough',
		OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
		OSIONOS_BAAS_URL: BAAS_URL,
		KONG_SERVICE_API_KEY: 'service-role-test-key',
		OSIONOS_QUERY_ROUTER_URL: QUERY_ROUTER_URL,
		OSIONOS_BAAS_API_KEY: 'tenant-test-key',
	});
}

/**
 * JSON request headers carrying an app session for `userId`, whose private workspace is
 * `homeWorkspaceId`; `memberWorkspaceIds` ride along in the token as shared workspaces.
 */
export function sessionHeaders(config, userId, homeWorkspaceId, memberWorkspaceIds = []) {
	const payload = validateBridgePayload({ provider: 'prismatica', subject: userId, email: 'member@example.com', name: 'Member', jti: randomUUID() });
	const persisted = { workspaceId: homeWorkspaceId, workspaceName: 'Home', workspaceSlug: 'home' };
	const session = createUserSession(payload, config, persisted, Date.now(), memberWorkspaceIds.map((id) => ({ _id: id, role: 'member' })));
	return { authorization: `Bearer ${session.session.accessToken}`, 'content-type': 'application/json' };
}

export async function withBridge(config, fetchImpl, run, serverOptions = {}) {
	const server = createBridgeServer({ config, fetchImpl, ...serverOptions });
	await new Promise((done) => server.listen(0, '127.0.0.1', done));
	try {
		return await run(`http://127.0.0.1:${server.address().port}`);
	} finally {
		await new Promise((done) => server.close(done));
	}
}

/** One HTTP call against the running bridge: status, raw text (to assert what it never contains) and parsed body. */
export async function send(base, path, headers, init = {}) {
	const response = await fetch(`${base}${path}`, { headers, ...init });
	const text = await response.text();
	return { status: response.status, text, body: text ? JSON.parse(text) : null };
}

export const post = (body) => ({ method: 'POST', body: JSON.stringify(body) });
export const patch = (body) => ({ method: 'PATCH', body: JSON.stringify(body) });

export function teamPage(id, ownerId, visibility, title, text) {
	return {
		id, workspace_id: IDS.team, owner_id: ownerId, visibility, title, collaborators: [], properties: [],
		parent_page_id: null, archived_at: null, content: [{ id: `${id}-b1`, type: 'paragraph', content: text }],
		created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
	};
}

/** A owns the team workspace; B is a member with `memberRole` (viewer = read only, editor = read/create/update). */
export function teamWorld({ memberRole = 'viewer' } = {}) {
	return {
		osionos_workspace_members: [
			{ workspace_id: IDS.team, user_id: IDS.userA, role: 'owner', permissions: ALL_PERMISSIONS },
			{ workspace_id: IDS.team, user_id: IDS.userB, role: memberRole, permissions: memberRole === 'viewer' ? ['read'] : ['create', 'read', 'update'] },
		],
		osionos_pages: [
			teamPage(IDS.privateA, IDS.userA, 'private', 'A private plan', `${SECRET} links to the B page`),
			teamPage(IDS.sharedA, IDS.userA, 'shared', 'Team notes', 'shared text that links to the B page'),
			teamPage(IDS.memoA, IDS.userA, 'private', 'A memo', `${SECRET} mentions B notes`),
			teamPage(IDS.sharedMemoA, IDS.userA, 'shared', 'Team memo', 'shared text mentions B notes'),
			teamPage(IDS.pageB, IDS.userB, 'private', 'B notes', 'B own text'),
		],
		osionos_page_links: [
			{ source_page_id: IDS.privateA, target_page_id: IDS.pageB, workspace_id: IDS.team },
			{ source_page_id: IDS.sharedA, target_page_id: IDS.pageB, workspace_id: IDS.team },
		],
	};
}
