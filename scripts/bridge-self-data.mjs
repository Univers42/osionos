/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-self-data.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The self sources over HTTP: GET /api/account/self-data/<source>.
 *
 * The answer is a projection of the caller's own rows — { ok, source, columns, rows,
 * truncated }. The columns are the registry's allowlist and every row carries exactly
 * those keys, so a column the bridge does not name never reaches a dashboard.
 *
 * Two kinds of read, and the difference is the security edge:
 *   - the account role reads the two account-plane tables (`my-published`, `my-sessions`)
 *     with the caller's own JWT; the row-level security of the table is the scope and the
 *     service key never reaches those reads;
 *   - the service role reads the four legacy tables, and their ONLY scope is the filter
 *     in the path. A missing filter would be a full-table read, so the filter is part of
 *     the path and never a filter applied in JavaScript after the fetch.
 *
 * A store failure is a 503 and never an empty list: "you have none" and "the store is
 * down" are different answers, and only one of them is true.
 *
 * Caveat: the cap is a row count, not a page — a user with 5,000 pages sees the 200 the
 * query ordered first, and the rest are unreachable from this source.
 */

import { rateLimit } from './bridge-guard.mjs';
import { idChunks, inFilter } from './bridge-paging.mjs';
import { bearerToken, blockedViewerBy, sendJson } from './bridge-social-core.mjs';
import { connectionPeerId, peerCard, selfSourceById, dedupeEdgesByPeer } from './bridge-self-sources.mjs';
import { serviceFetch } from './bridge-account-profile.mjs';

const SELF_DATA_PREFIX = '/api/account/self-data/';
const ROW_LIMIT = 200;
// The read asks for one row more than the cap: a 201st row is what proves the answer was
// cut, so the flag is computed and never guessed.
const READ_LIMIT = ROW_LIMIT + 1;
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

function selfDataError(status, code, message, extra) {
	return Object.assign(new Error(message), { status, code }, extra);
}

/** The one path this module owns: /api/account/self-data/<segment>, one segment only. */
function selfDataSegment(pathname) {
	if (!pathname.startsWith(SELF_DATA_PREFIX)) return null;
	const segment = pathname.slice(SELF_DATA_PREFIX.length);
	// Two segments are another route's path (the saved views), not this one.
	if (segment === '' || segment.includes('/')) return null;
	return segment;
}

/** The columns of the answer: the allowlist and the computed keys, in that order. */
function answerColumns(source) {
	return [...source.columns, ...Object.keys(source.computed ?? {})];
}

/** The scope of a source, as the query string of the path. */
function scopeFilter(source, userId) {
	const scope = source.scope ?? {};
	if (scope.kind === 'owner' || scope.kind === 'membership') return `${scope.column}=eq.${userId}`;
	if (scope.kind === 'edge') return `or=(${scope.columns.map((column) => `${column}.eq.${userId}`).join(',')})`;
	// The account role: the row-level security of the table is the scope, and it holds
	// the caller's rows only.
	return '';
}

/** The filters of a source, with the clock's answers resolved. */
function sourceFilters(source, now) {
	return (source.filters ?? []).map((filter) => ({
		column: filter.column,
		op: filter.op === 'gt.now' ? `gt.${new Date(now).toISOString()}` : filter.op,
	}));
}

/** One PostgREST path: the named columns, the scope, the filters, the order and the cap. */
function readPath({ table, select, scope = '', filters = [], order = '', limit = READ_LIMIT }) {
	const parts = [`select=${select}`];
	for (const filter of filters) parts.push(`${filter.column}=${filter.op}`);
	if (scope) parts.push(scope);
	if (order) parts.push(`order=${order}`);
	parts.push(`limit=${limit}`);
	return `${table}?${parts.join('&')}`;
}

/** One row of a source: exactly the allowlisted keys and the computed ones. */
function sourceRow(source, row, context) {
	const out = {};
	for (const column of source.columns) out[column] = row?.[column] ?? null;
	for (const [name, compute] of Object.entries(source.computed ?? {})) out[name] = compute(row, context);
	return out;
}

/** The client a source is read with: the account role for its own tables, the service key for the rest. */
function sourceClient(pg, session, source) {
	return source.scope.kind === 'account' ? pg.asUser(session) : pg.asService();
}

/** The rows of a flat source: one read, scoped by the path. */
async function readFlatRows({ pg, session, now }, source) {
	const rows = await sourceClient(pg, session, source).get(readPath({
		table: source.table,
		select: (source.readColumns ?? source.columns).join(','),
		scope: scopeFilter(source, session.userId),
		filters: sourceFilters(source, now),
		order: source.order,
	}));
	if (!Array.isArray(rows)) throw new Error('self data store answered a non-array');
	return rows;
}

/** The peers of the edges: the other party of each edge, once each. */
function peerIds(rows, userId) {
	const ids = [];
	for (const row of rows) {
		const peer = String(connectionPeerId(row, userId) ?? '').toLowerCase();
		if (peer !== '' && !ids.includes(peer)) ids.push(peer);
	}
	return ids;
}

/** The directory rows of the peers, in chunks: an `in.()` list breaks around 90 ids. */
async function readDirectory(pg, source, ids) {
	const rows = new Map();
	const related = source.related;
	for (const chunk of idChunks(ids, related.chunk)) {
		const found = await pg.asService().get(`${related.table}?${inFilter(related.idColumn, chunk)}&select=${related.columns.join(',')}`);
		if (!Array.isArray(found)) throw new Error('self data store answered a non-array');
		for (const row of found) {
			rows.set(String(row?.[related.idColumn] ?? '').toLowerCase(), row);
		}
	}
	return rows;
}

/** The edges of the caller, each with the public card of its peer. */
async function readEdgeRows({ pg, config, session, now }, source) {
	const edges = await readFlatRows({ pg, session, now }, source);
	const deduped = dedupeEdgesByPeer(edges, session.userId);
	const ids = peerIds(deduped, session.userId);
	const directory = await readDirectory(pg, source, ids);
	// The block set is the one thing that hides a person from a viewer: the helper owns
	// the rule (a block in either direction), so it is used and never copied.
	const hidden = await blockedViewerBy(config, serviceFetch(pg), session.userId);
	const cards = new Map(ids.map((id) => [id, peerCard(id, directory.get(id), hidden)]));
	const context = {
		userId: session.userId,
		peerOf: (row) => cards.get(String(connectionPeerId(row, session.userId) ?? '').toLowerCase()) ?? null,
	};
	return deduped.map((row) => sourceRow(source, row, context));
}

/**
 * The workspaces of the caller: one row per membership, with the workspace's own columns.
 * The membership table is the authority — a workspace the caller owns without a membership
 * row is not "my workspace" — and the workspace table is the only place that knows the name.
 */
async function readMembershipRows({ pg, session, now }, source) {
	const related = source.related;
	const members = await readFlatRows({ pg, session, now }, source);
	const owned = await pg.asService().get(readPath({
		table: related.table,
		select: related.columns.join(','),
		scope: `${related.ownerColumn}=eq.${session.userId}`,
		order: source.order,
	}));
	if (!Array.isArray(owned)) throw new Error('self data store answered a non-array');
	const workspaces = new Map();
	const remember = (row) => workspaces.set(String(row?.[related.idColumn] ?? '').toLowerCase(), row);
	for (const row of owned) remember(row);
	const missing = [];
	for (const member of members) {
		const id = String(member?.workspace_id ?? '').toLowerCase();
		if (id !== '' && !workspaces.has(id) && !missing.includes(id)) missing.push(id);
	}
	for (const chunk of idChunks(missing, related.chunk)) {
		const found = await pg.asService().get(`${related.table}?${inFilter(related.idColumn, chunk)}&select=${related.columns.join(',')}`);
		if (!Array.isArray(found)) throw new Error('self data store answered a non-array');
		for (const row of found) remember(row);
	}
	return members.map((member) => {
		const row = {};
		for (const column of source.readColumns) row[column] = member?.[column] ?? null;
		const workspace = workspaces.get(String(member?.workspace_id ?? '').toLowerCase());
		for (const column of related.columns) row[column] = workspace?.[column] ?? null;
		return row;
	});
}

/** The rows of a source, read the way its scope says. */
async function readSourceRows(context, source) {
	if (source.scope.kind === 'membership') return readMembershipRows(context, source);
	if (source.scope.kind === 'edge') return readEdgeRows(context, source);
	const rows = await readFlatRows(context, source);
	return rows.map((row) => sourceRow(source, row, {
		userId: context.session.userId,
		session: context.session,
	}));
}

/** The bridge's clock: the one that stamped the session rows. */
function bridgeNow(config) {
	return config.sessionCutoffs?.now?.() ?? Date.now();
}

function respondWithError(response, error, config) {
	const status = Number.isInteger(error?.status) ? error.status : 500;
	const code = typeof error?.code === 'string' && /^[a-z][a-z0-9_]*$/.test(error.code)
		? error.code
		: (status === 401 ? 'not_authenticated' : 'self_data_failed');
	const body = { ok: false, message: error instanceof Error ? error.message : 'The request failed.', code };
	if (Number.isFinite(error?.retryAfterSeconds)) {
		body.retryAfterSeconds = error.retryAfterSeconds;
		response.setHeader('retry-after', String(error.retryAfterSeconds));
	}
	return sendJson(response, status, body, config);
}

/**
 * The account route of this module: GET /api/account/self-data/<source>. It answers true
 * when it handled the request and false when the path is not its own.
 */
export function createSelfDataRoutes({ config, pg, kv, verifySession }) {
	return async function handleAccountSelfData(url, request, response) {
		const segment = selfDataSegment(url.pathname);
		if (segment === null) return false;
		const method = (request.method || 'GET').toUpperCase();
		if (method !== 'GET') {
			return respondWithError(response, selfDataError(405, 'method_not_allowed', `Method ${method} is not supported on this route.`), config);
		}
		try {
			const session = verifySession(bearerToken(request), config);
			const source = selfSourceById(segment);
			if (!source) {
				return respondWithError(response, selfDataError(404, 'unknown_self_source', 'This data source does not exist.'), config);
			}
			await rateLimit(kv, ['self-data', session.userId], { limit: RATE_LIMIT, windowMs: RATE_WINDOW_MS });
			let rows;
			try {
				rows = await readSourceRows({ pg, config, session, now: bridgeNow(config) }, source);
			} catch (error) {
				// A store failure is a 503 and never an empty list: "you have none" and "the
				// store is down" are different answers, and only one of them is true.
				console.warn(`[osionos-bridge] self data read failed: ${error?.code ?? error?.status ?? 'unknown'}`);
				throw selfDataError(503, 'self_data_unavailable', 'Your data could not be read; try again shortly.');
			}
			const truncated = rows.length > ROW_LIMIT;
			return sendJson(response, 200, {
				ok: true,
				source: source.id,
				columns: answerColumns(source),
				rows: truncated ? rows.slice(0, ROW_LIMIT) : rows,
				truncated,
			}, config);
		} catch (error) {
			return respondWithError(response, error, config);
		}
	};
}
