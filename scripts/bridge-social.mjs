/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-social.mjs                                   :+:      :+:    :+:  */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Social graph for the osionos bridge (`/api/directory/*`, `/api/connections*`,
 * `/api/social/*`) — standalone module in the bridge-rtc style: bridge-api.mjs
 * injects `config` + `verifySession`. All shared plumbing (rest / sendJson /
 * identitySummaries / blockedViewerBy …) is imported from bridge-social-core.mjs;
 * nothing is re-declared here.
 *
 * Block-awareness is enforced everywhere a target is surfaced: rows where the
 * target blocked the viewer are dropped, and directory_opt_out=true rows are
 * hidden from search. Connection state transitions enforce who-may-do-what.
 */

import {
	UUID_REGEX,
	bearerToken,
	blockedViewerBy,
	directoryFuzzyFilter,
	ensureColleagueConnections,
	httpError,
	identitySummaries,
	publishRealtime,
	readJsonBody,
	requireUuid,
	rest,
	safeText,
	sendJson,
} from './bridge-social-core.mjs';

const PRESENCE_WINDOW_MS = 90 * 1000;

function isOnline(lastSeenAt, now = Date.now()) {
	const seen = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
	return Number.isFinite(seen) && now - seen < PRESENCE_WINDOW_MS;
}

function personEntry(row) {
	const profile = row.profile && typeof row.profile === 'object' && !Array.isArray(row.profile) ? row.profile : {};
	return {
		id: row.user_id,
		name: typeof row.display_name === 'string' && row.display_name ? row.display_name : 'Member',
		username: row.username ?? null,
		avatar: typeof profile.avatar === 'string' ? profile.avatar : null,
		headline: typeof profile.headline === 'string' ? profile.headline : null,
		online: isOnline(row.last_seen_at),
	};
}

/** GET /api/directory/search — text/hybrid ilike (semantic falls back to text). */
async function directorySearch(deps, session, url, response, config) {
	const query = safeText(url.searchParams.get('q'), 80);
	const limitRaw = Number(url.searchParams.get('limit'));
	const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 50) : 20;
	// People come from the authoritative public.users (via the safe
	// osionos_people_directory view), NOT the sparse local identity cache.
	let path = 'osionos_people_directory?select=user_id,display_name,username,profile,last_seen_at,directory_opt_out&order=display_name.asc&limit=200';
	path += '&directory_opt_out=not.eq.true';
	path += directoryFuzzyFilter(query); // fuzzy: name/username/headline ILIKE + stem + FTS
	const rows = await rest(config, deps.fetchImpl, path);
	const blockers = await blockedViewerBy(config, deps.fetchImpl, session.userId);
	const people = [];
	for (const row of Array.isArray(rows) ? rows : []) {
		if (row.directory_opt_out === true) continue;
		if (blockers.has(row.user_id)) continue;
		if (row.user_id === session.userId) continue;
		people.push(personEntry(row));
		if (people.length >= limit) break;
	}
	return sendJson(response, 200, { ok: true, people }, config);
}

/** GET /api/connections — caller's edges + peer identity summary, block-aware. */
async function listConnections(deps, session, url, response, config) {
	// Teammates are connected by default: reconcile colleague edges before reading,
	// so the list always reflects the current shared-workspace roster. Best-effort.
	await ensureColleagueConnections(config, deps.fetchImpl, session.userId);
	const status = safeText(url.searchParams.get('status'), 16);
	const direction = safeText(url.searchParams.get('direction'), 16) || 'all';
	let path = `osionos_connections?or=(requester_id.eq.${session.userId},addressee_id.eq.${session.userId})&select=*&order=created_at.desc`;
	if (status) path += `&status=eq.${encodeURIComponent(status)}`;
	const rows = await rest(config, deps.fetchImpl, path);
	const blockers = await blockedViewerBy(config, deps.fetchImpl, session.userId);
	const filtered = (Array.isArray(rows) ? rows : []).filter((row) => {
		const outgoing = row.requester_id === session.userId;
		if (direction === 'incoming' && outgoing) return false;
		if (direction === 'outgoing' && !outgoing) return false;
		const peer = outgoing ? row.addressee_id : row.requester_id;
		return !blockers.has(peer);
	});
	const peers = filtered.map((row) => (row.requester_id === session.userId ? row.addressee_id : row.requester_id));
	const identities = await identitySummaries(config, deps.fetchImpl, peers);
	const connections = filtered.map((row) => {
		const peer = row.requester_id === session.userId ? row.addressee_id : row.requester_id;
		const summary = identities.get(peer);
		const online = summary?.lastSeenAt ? Date.now() - new Date(summary.lastSeenAt).getTime() < 90_000 : false;
		return {
			id: row.id,
			// nested peer matches the frontend ContactEdge type (store/social/types.ts)
			peer: { id: peer, name: summary?.name ?? 'Member', avatar: summary?.avatar ?? null, online },
			status: row.status,
			direction: row.requester_id === session.userId ? 'outgoing' : 'incoming',
			introMessage: row.intro_message ?? null,
			source: row.source ?? 'manual',
			createdAt: row.created_at ?? null,
			respondedAt: row.responded_at ?? null,
		};
	});
	return sendJson(response, 200, { ok: true, connections }, config);
}

/** POST /api/connections — request a connection (pending). */
async function createConnection(deps, session, request, response, config) {
	const payload = await readJsonBody(request);
	const addresseeId = requireUuid(payload.addresseeId, 'addresseeId');
	if (addresseeId === session.userId) throw httpError('Cannot connect with yourself.', 422);
	const blockRows = await rest(
		config,
		deps.fetchImpl,
		`osionos_user_blocks?or=(and(blocker_id.eq.${session.userId},blocked_id.eq.${addresseeId}),and(blocker_id.eq.${addresseeId},blocked_id.eq.${session.userId}))&select=blocker_id&limit=1`,
	);
	if (Array.isArray(blockRows) && blockRows.length > 0) throw httpError('Connection is blocked.', 403);
	const pair = [session.userId, addresseeId].sort((a, b) => a.localeCompare(b)).join(':');
	const existing = await rest(config, deps.fetchImpl, `osionos_connections?pair_key=eq.${encodeURIComponent(pair)}&select=id,status&limit=1`);
	const prior = Array.isArray(existing) && existing.length > 0 ? existing[0] : null;
	// An ACTIVE edge (pending/accepted) genuinely already exists → conflict. But a
	// withdrawn/declined edge is terminal: REACTIVATE it as a fresh pending request from
	// this requester, so a peer can re-invite after a withdraw instead of being stuck on 409.
	if (prior && (prior.status === 'pending' || prior.status === 'accepted')) {
		throw httpError('A connection already exists for this pair.', 409);
	}
	const body = {
		requester_id: session.userId,
		addressee_id: addresseeId,
		status: 'pending',
		intro_message: safeText(payload.introMessage, 500) || null,
		source: 'manual',
		responded_at: null,
	};
	const rows = prior
		? await rest(config, deps.fetchImpl, `osionos_connections?id=eq.${prior.id}`, { method: 'PATCH', body, prefer: 'return=representation' })
		: await rest(config, deps.fetchImpl, 'osionos_connections', { method: 'POST', body, prefer: 'return=representation' });
	const row = Array.isArray(rows) ? rows[0] : rows;
	if (!row) throw httpError('Connection request failed.', 502);
	// Return the SAME nested-peer shape as GET /api/connections so the frontend
	// ContactEdge maps cleanly. Returning a bare id left `reply.connection` undefined
	// → the store inserted undefined → "can't access property 'peer'" crash on connect.
	const identities = await identitySummaries(config, deps.fetchImpl, [addresseeId]);
	const summary = identities.get(addresseeId);
	const online = summary?.lastSeenAt ? Date.now() - new Date(summary.lastSeenAt).getTime() < 90_000 : false;
	const connection = {
		id: row.id,
		peer: { id: addresseeId, name: summary?.name ?? 'Member', avatar: summary?.avatar ?? null, online },
		status: row.status,
		direction: 'outgoing',
		introMessage: row.intro_message ?? null,
		source: row.source ?? 'manual',
		createdAt: row.created_at ?? null,
		respondedAt: row.responded_at ?? null,
	};
	// Live-notify the addressee so their notification bell updates without a refresh.
	await publishRealtime({
		topic: `user:${addresseeId}`,
		eventType: 'connection_requested',
		payload: { connectionId: row.id, from: session.userId },
		fetchImpl: deps.fetchImpl,
		env: deps.env,
	}).catch(() => undefined);
	return sendJson(response, 201, { ok: true, connection }, config);
}

/** PATCH /api/connections/:id — accept|decline (addressee) or withdraw (requester). */
async function patchConnection(deps, session, request, connectionId, response, config) {
	const payload = await readJsonBody(request);
	const action = safeText(payload.action, 16);
	const rows = await rest(config, deps.fetchImpl, `osionos_connections?id=eq.${connectionId}&select=*&limit=1`);
	const row = Array.isArray(rows) ? rows[0] : null;
	if (!row) throw httpError('Connection not found.', 404);
	const isAddressee = row.addressee_id === session.userId;
	const isRequester = row.requester_id === session.userId;
	let status;
	if ((action === 'accept' || action === 'decline') && isAddressee) status = action === 'accept' ? 'accepted' : 'declined';
	else if (action === 'withdraw' && isRequester) status = 'withdrawn';
	else throw httpError('You cannot perform this action on this connection.', 403);
	await rest(config, deps.fetchImpl, `osionos_connections?id=eq.${connectionId}`, {
		method: 'PATCH',
		body: { status, responded_at: new Date().toISOString() },
		prefer: 'return=minimal',
	});
	if (status === 'accepted') {
		const other = isAddressee ? row.requester_id : row.addressee_id;
		await publishRealtime({
			topic: `user:${other}`,
			eventType: 'connection_updated',
			payload: { connectionId, status, by: session.userId },
			fetchImpl: deps.fetchImpl,
			env: deps.env,
		});
	}
	return sendJson(response, 200, { ok: true, connectionId, status }, config);
}

/** DELETE /api/connections/:id — either party removes an accepted edge. */
async function deleteConnection(deps, session, connectionId, response, config) {
	const rows = await rest(config, deps.fetchImpl, `osionos_connections?id=eq.${connectionId}&select=requester_id,addressee_id&limit=1`);
	const row = Array.isArray(rows) ? rows[0] : null;
	if (!row) throw httpError('Connection not found.', 404);
	if (row.requester_id !== session.userId && row.addressee_id !== session.userId) {
		throw httpError('You are not part of this connection.', 403);
	}
	await rest(config, deps.fetchImpl, `osionos_connections?id=eq.${connectionId}`, { method: 'DELETE', prefer: 'return=minimal' });
	return sendJson(response, 200, { ok: true, connectionId, deleted: true }, config);
}

/** GET/POST/DELETE /api/social/blocks + POST /api/social/reports. */
async function handleSocialOps(deps, session, request, url, response, config) {
	const pathname = url.pathname;
	const method = (request.method || 'GET').toUpperCase();
	if (pathname === '/api/social/blocks' && method === 'GET') {
		const rows = await rest(config, deps.fetchImpl, `osionos_user_blocks?blocker_id=eq.${session.userId}&select=blocked_id,reason,created_at&order=created_at.desc`);
		const list = Array.isArray(rows) ? rows : [];
		const identities = await identitySummaries(config, deps.fetchImpl, list.map((row) => row.blocked_id));
		const blocks = list.map((row) => ({
			userId: row.blocked_id,
			name: identities.get(row.blocked_id)?.name ?? 'Member',
			avatar: identities.get(row.blocked_id)?.avatar ?? null,
			reason: row.reason ?? null,
			createdAt: row.created_at ?? null,
		}));
		return sendJson(response, 200, { ok: true, blocks }, config);
	}
	if (pathname === '/api/social/blocks' && method === 'POST') {
		const payload = await readJsonBody(request);
		const blockedId = requireUuid(payload.userId, 'userId');
		if (blockedId === session.userId) throw httpError('Cannot block yourself.', 422);
		await rest(config, deps.fetchImpl, 'osionos_user_blocks?on_conflict=blocker_id,blocked_id', {
			method: 'POST',
			body: { blocker_id: session.userId, blocked_id: blockedId, reason: safeText(payload.reason, 300) || null },
			prefer: 'resolution=merge-duplicates,return=minimal',
		});
		const pair = [session.userId, blockedId].sort((a, b) => a.localeCompare(b)).join(':');
		await rest(config, deps.fetchImpl, `osionos_connections?pair_key=eq.${encodeURIComponent(pair)}`, {
			method: 'PATCH',
			body: { status: 'blocked', responded_at: new Date().toISOString() },
			prefer: 'return=minimal',
		});
		return sendJson(response, 201, { ok: true, userId: blockedId, blocked: true }, config);
	}
	const blockMatch = /^\/api\/social\/blocks\/([0-9a-f-]{36})$/i.exec(pathname);
	if (blockMatch && method === 'DELETE') {
		const blockedId = requireUuid(blockMatch[1], 'userId');
		await rest(config, deps.fetchImpl, `osionos_user_blocks?blocker_id=eq.${session.userId}&blocked_id=eq.${blockedId}`, { method: 'DELETE', prefer: 'return=minimal' });
		return sendJson(response, 200, { ok: true, userId: blockedId, unblocked: true }, config);
	}
	if (pathname === '/api/social/reports' && method === 'POST') {
		const payload = await readJsonBody(request);
		const subjectKind = safeText(payload.subjectKind, 32) || 'user';
		const rows = await rest(config, deps.fetchImpl, 'osionos_user_reports', {
			method: 'POST',
			body: {
				reporter_id: session.userId,
				subject_user_id: UUID_REGEX.test(safeText(payload.subjectUserId, 80)) ? payload.subjectUserId : null,
				subject_kind: subjectKind,
				subject_id: safeText(payload.subjectId, 220) || null,
				category: safeText(payload.category, 64) || 'other',
				details: safeText(payload.details, 2000) || null,
			},
			prefer: 'return=representation',
		});
		const row = Array.isArray(rows) ? rows[0] : rows;
		if (!row) throw httpError('Report failed.', 502);
		return sendJson(response, 201, { ok: true, reportId: row.id }, config);
	}
	return sendJson(response, 404, { ok: false, message: 'Social route not found.' }, config);
}

/**
 * Build the social-graph dispatcher: `await handler(url, request, response)` →
 * true when handled. deps: { config, verifySession, fetchImpl?, env? }.
 */
export function createSocialHandler({ config, verifySession, fetchImpl = fetch, env = process.env }) {
	const deps = { fetchImpl, env };
	return async function handleSocialRoute(url, request, response, requestConfig = config) {
		const pathname = url.pathname;
		const isConnections = pathname === '/api/connections';
		const connMatch = /^\/api\/connections\/([0-9a-f-]{36})$/i.exec(pathname);
		if (pathname !== '/api/directory/search' && !isConnections && !connMatch && !pathname.startsWith('/api/social/')) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			if (pathname === '/api/directory/search' && method === 'GET') return await directorySearch(deps, session, url, response, requestConfig);
			if (isConnections && method === 'GET') return await listConnections(deps, session, url, response, requestConfig);
			if (isConnections && method === 'POST') return await createConnection(deps, session, request, response, requestConfig);
			if (connMatch && method === 'PATCH') return await patchConnection(deps, session, request, requireUuid(connMatch[1], 'connectionId'), response, requestConfig);
			if (connMatch && method === 'DELETE') return await deleteConnection(deps, session, requireUuid(connMatch[1], 'connectionId'), response, requestConfig);
			if (pathname.startsWith('/api/social/')) return await handleSocialOps(deps, session, request, url, response, requestConfig);
			return sendJson(response, 405, { ok: false, message: `Method ${method} is not supported here.` }, requestConfig);
		} catch (error) {
			return sendJson(response, error?.status ?? 500, { ok: false, message: error instanceof Error ? error.message : 'Social request failed.' }, requestConfig);
		}
	};
}
