/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-social-core.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Shared plumbing for the social bridge modules (bridge-chat / bridge-profile /
 * bridge-feed). Node built-ins only — no npm deps, does not import
 * bridge-api.mjs (handlers receive its `config` + `verifySession` injected,
 * exactly like bridge-rtc.mjs).
 *
 * Realtime publishing goes server-side to the Rust realtime gateway
 * (mini-baas network) — REST contract from realtime-gateway/src/rest_api.rs:
 *   POST {REALTIME_PUBLISH_URL}/v1/publish  { topic, event_type, payload }
 * Publishes are best-effort: chat/feed writes never fail because the gateway
 * is down. Env: REALTIME_PUBLISH_URL (default http://mini-baas-realtime:4000);
 * REALTIME_PUBLISH_APIKEY, the service_role key when that URL is grobase's edge
 * (http://mini-baas-kong:8000/realtime: Kong admits that key alone there). A ws://
 * or wss:// URL (grobase's /realtime/v1/ws, behind a Funnel link) publishes over
 * one authenticated socket instead: bridge-realtime-socket.mjs.
 */

import { BAAS_FETCH_TIMEOUT_MS, readBaasJson } from './bridge-baas-body.mjs';
import { realtimeSocketPublisher } from './bridge-realtime-socket.mjs';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLISH_TIMEOUT_MS = 1_500;
const DEFAULT_BODY_LIMIT = 16_384;

export function httpError(message, status) {
	return Object.assign(new Error(message), { status });
}

export function safeText(value, limit) {
	return String(value ?? '')
		.normalize('NFKC')
		.replaceAll(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
		.trim()
		.slice(0, limit);
}

export function requireUuid(value, fieldName) {
	const normalized = safeText(value, 80);
	if (!UUID_REGEX.test(normalized)) throw httpError(`${fieldName} must be a UUID.`, 422);
	return normalized;
}

export async function readJsonBody(request, maxBytes = DEFAULT_BODY_LIMIT) {
	let body = '';
	for await (const chunk of request) {
		body += chunk;
		if (body.length > maxBytes) throw httpError('Request body too large.', 413);
	}
	try {
		return body ? JSON.parse(body) : {};
	} catch {
		throw httpError('Request body must be JSON.', 400);
	}
}

export function sendJson(response, status, body, config) {
	response.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
		'access-control-allow-origin': config.allowedOrigin,
		'access-control-allow-credentials': 'true',
		vary: 'Origin',
	});
	response.end(JSON.stringify(body));
	return true;
}

export function bearerToken(request) {
	const match = /^Bearer\s+(.+)$/i.exec(String(request.headers.authorization ?? ''));
	if (!match) throw httpError('App session bearer token is required.', 401);
	return match[1].trim();
}

/** Service-role PostgREST call through the same Kong the rest of the bridge uses. */
export async function rest(config, fetchImpl, path, { method = 'GET', body, prefer } = {}) {
	if (!config.baasUrl || !config.serviceKey) {
		throw httpError('osionos BaaS service-role access is not configured.', 503);
	}
	const headers = {
		Accept: 'application/json',
		apikey: config.serviceKey,
		Authorization: `Bearer ${config.serviceKey}`,
	};
	if (body !== undefined) headers['Content-Type'] = 'application/json';
	if (prefer) headers.Prefer = prefer;
	const response = await fetchImpl(`${config.baasUrl}/rest/v1/${path}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: AbortSignal.timeout(BAAS_FETCH_TIMEOUT_MS),
	});
	if (!response.ok) {
		const status = response.status === 401 || response.status === 403 ? 403 : (response.status === 404 ? 404 : 502);
		const text = await response.text().catch(() => '');
		throw httpError(`BaaS request failed with ${response.status}: ${text.slice(0, 160)}`, status);
	}
	return readBaasJson(response, { service: 'service-role PostgREST', empty: null, fail: readFailure });
}

/** The 502 a broken BaaS body raises here; readBaasJson only words the message. */
function readFailure(message) {
	return httpError(message, 502);
}

/** Best-effort publish to the Rust realtime gateway; never throws. */
export async function publishRealtime({ topic, eventType, payload, fetchImpl = fetch, env = process.env }) {
	const base = (env.REALTIME_PUBLISH_URL || 'http://mini-baas-realtime:4000').replace(/\/$/, '');
	if (/^wss?:\/\//i.test(base)) return realtimeSocketPublisher(base, env).publish(topic, eventType, payload);
	const apikey = (env.REALTIME_PUBLISH_APIKEY ?? '').trim();
	const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
	if (apikey) headers.apikey = apikey;
	try {
		const response = await fetchImpl(`${base}/v1/publish`, {
			method: 'POST',
			headers,
			body: JSON.stringify({ topic, event_type: eventType, payload }),
			signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS),
		});
		if (!response.ok) {
			console.warn(`[osionos-bridge] realtime publish ${topic} failed with ${response.status}`);
			return false;
		}
		return true;
	} catch (error) {
		console.warn(`[osionos-bridge] realtime publish ${topic} skipped: ${error instanceof Error ? error.message : 'unreachable'}`);
		return false;
	}
}

/** The agency/org workspace everyone belongs to (people search + feed default). */
export function orgWorkspaceId(env = process.env) {
	const id = safeText(env.OSIONOS_ORG_WORKSPACE_ID ?? env.AGENCY_WORKSPACE_ID, 80);
	return UUID_REGEX.test(id) ? id : '';
}

/** osionos_workspace_members row for (user, workspace) or null. */
export async function workspaceMembership(config, fetchImpl, userId, workspaceId) {
	const rows = await rest(
		config,
		fetchImpl,
		`osionos_workspace_members?workspace_id=eq.${workspaceId}&user_id=eq.${userId}&select=role,permissions&limit=1`,
	);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

/**
 * The ids in `workspaceIds` the session belongs to: its own token workspaces plus its
 * osionos_workspace_members rows (lower-cased). Throws on a backend failure, so a caller
 * deciding access fails closed instead of reading "not a member".
 */
export async function memberWorkspacesAmong(config, fetchImpl, session, workspaceIds) {
	const wanted = [...new Set(workspaceIds.filter((id) => UUID_REGEX.test(String(id))).map((id) => id.toLowerCase()))];
	const own = new Set((session.workspaceIds ?? []).map((id) => String(id).toLowerCase()));
	const others = wanted.filter((id) => !own.has(id));
	const rows = others.length === 0 ? [] : await rest(
		config,
		fetchImpl,
		`osionos_workspace_members?user_id=eq.${session.userId}&workspace_id=in.(${others.join(',')})&select=workspace_id`,
	);
	return [...wanted.filter((id) => own.has(id)), ...(Array.isArray(rows) ? rows : []).map((row) => String(row.workspace_id).toLowerCase())];
}

/**
 * Set of user ids hidden from the viewer because a block exists in EITHER
 * direction: someone who blocked the viewer, OR someone the viewer blocked.
 * Blocking is symmetric for visibility — used to hide those targets from
 * directory search / people / connection lists. Shared by bridge-social /
 * bridge-collab / bridge-profile so the block-aware filter lives in one place.
 */
export async function blockedViewerBy(config, fetchImpl, viewerId) {
	if (!UUID_REGEX.test(String(viewerId))) return new Set();
	const rows = await rest(
		config,
		fetchImpl,
		`osionos_user_blocks?or=(blocked_id.eq.${viewerId},blocker_id.eq.${viewerId})&select=blocker_id,blocked_id`,
	);
	const hidden = new Set();
	for (const row of Array.isArray(rows) ? rows : []) {
		// the "other" party in each block edge is the one to hide from the viewer
		hidden.add(row.blocker_id === viewerId ? row.blocked_id : row.blocker_id);
	}
	return hidden;
}

/**
 * Build the PostgREST `or=(…)` fuzzy filter for directory/people search across
 * display_name, username and profile->>headline. Robust for IMPRECISE queries:
 *   - ILIKE `*q*` substring (trigram-GIN accelerated) on name + username + headline
 *   - websearch full-text on the generated search_doc tsvector (stemmed, covers
 *     bio/headline whole words) — `search_doc.wfts(simple).<q>`
 *   - a trailing-trimmed PREFIX ILIKE (drop the last char when len≥4) so a typo'd
 *     partial like "sofa" still surfaces "Sofia" via `*sof*`
 * Returns '' for an empty query (caller leaves the list unfiltered). The whole
 * thing is ONE `or` group, so a single round-trip returns the union — no second
 * fallback query is needed (an empty FTS match never hides the ILIKE hits).
 */
export function directoryFuzzyFilter(query) {
	const q = safeText(query, 80);
	if (!q) return '';
	const clauses = [];
	const sub = encodeURIComponent(`*${q}*`);
	clauses.push(`display_name.ilike.${sub}`, `username.ilike.${sub}`, `profile->>headline.ilike.${sub}`);
	// Stem the query so a typo'd tail ("sofa") still matches a longer name ("Sofia").
	const stem = q.length >= 4 ? q.slice(0, -1) : '';
	if (stem && stem !== q) {
		const subStem = encodeURIComponent(`*${stem}*`);
		clauses.push(`display_name.ilike.${subStem}`, `username.ilike.${subStem}`);
	}
	// websearch_to_tsquery is forgiving of phrasing; covers headline/bio whole words.
	clauses.push(`search_doc.wfts(simple).${encodeURIComponent(q)}`);
	return `&or=(${clauses.join(',')})`;
}

const SHARED_WORKSPACES_LIMIT = 200;
const COMEMBERS_PER_WORKSPACE_LIMIT = 500;
const COLLEAGUE_INSERT_CAP = 500;

/**
 * The one read that answers "who shares a workspace with `userId`": the caller's member rows
 * (anchor, `user_id=eq.`), each with its workspace's other members. Both limits are the old
 * ones (200 workspaces, 500 co-members); the nested limit is per workspace, so the insert
 * is capped again in insertColleagueEdges.
 */
export function coMemberPath(userId) {
	const query = new URLSearchParams({
		user_id: `eq.${userId}`,
		select: 'user_id,workspace_id,workspace:osionos_workspaces!workspace_id(members:osionos_workspace_members!workspace_id(user_id))',
		limit: String(SHARED_WORKSPACES_LIMIT),
		'workspace.members.user_id': `neq.${userId}`,
		'workspace.members.limit': String(COMEMBERS_PER_WORKSPACE_LIMIT),
	});
	return `osionos_workspace_members?${query}`;
}

/** Every edge touching `userId`, newest first, whatever its status: the sync and the list share this read. */
export function connectionEdgesPath(userId) {
	return `osionos_connections?or=(requester_id.eq.${userId},addressee_id.eq.${userId})&select=*&order=created_at.desc`;
}

/**
 * Distinct co-member ids from a coMemberPath answer, or null when any anchor row belongs to
 * another user: a dropped `user_id=eq.` anchor would otherwise make everyone a colleague.
 */
export function coMembersFromRows(rows, userId) {
	const self = String(userId).toLowerCase();
	const anchors = Array.isArray(rows) ? rows : [];
	if (anchors.some((row) => String(row?.user_id).toLowerCase() !== self)) return null;
	const peers = new Set();
	for (const row of anchors) {
		if (!UUID_REGEX.test(String(row.workspace_id))) continue;
		for (const member of Array.isArray(row.workspace?.members) ? row.workspace.members : []) {
			if (UUID_REGEX.test(String(member?.user_id)) && String(member.user_id).toLowerCase() !== self) peers.add(member.user_id);
		}
	}
	return [...peers];
}

/** Co-members of every workspace `userId` belongs to. Best-effort: a failure is a warn and no peers, never a throw. */
export async function sharedWorkspacePeers(config, fetchImpl, userId) {
	if (!UUID_REGEX.test(String(userId))) return [];
	try {
		const peers = coMembersFromRows(await rest(config, fetchImpl, coMemberPath(userId)), userId);
		if (peers !== null) return peers;
		console.warn('[osionos-bridge] colleague sync skipped: the co-member read answered another user\'s rows');
	} catch (error) {
		console.warn(`[osionos-bridge] colleague sync skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
	}
	return [];
}

/**
 * Insert an accepted source='colleague' edge to each of `peers` (the caller already removed
 * every peer with an edge, in any status and direction) and return the rows this call
 * inserted. on_conflict=pair_key + ignore-duplicates guards UNIQUE(pair_key) against a
 * concurrent insert or an inverse-direction row, and with return=representation answers
 * only the rows it really inserted. Best-effort: a failure is a warn and no rows.
 */
export async function insertColleagueEdges(config, fetchImpl, userId, peers) {
	if (peers.length === 0) return [];
	try {
		const respondedAt = new Date().toISOString();
		const rows = await rest(config, fetchImpl, 'osionos_connections?on_conflict=pair_key', {
			method: 'POST',
			body: peers.slice(0, COLLEAGUE_INSERT_CAP).map((peer) => ({
				requester_id: userId,
				addressee_id: peer,
				status: 'accepted',
				source: 'colleague',
				responded_at: respondedAt,
			})),
			prefer: 'resolution=ignore-duplicates,return=representation',
		});
		return Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') : [];
	} catch (error) {
		console.warn(`[osionos-bridge] colleague insert skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
		return [];
	}
}

const createdAtMs = (row) => {
	const ms = Date.parse(row.created_at);
	return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
};

/** Edge rows from several reads as one list: one row per id (the first list wins), newest created_at first. */
export function mergeEdgesNewestFirst(...lists) {
	const byId = new Map();
	for (const row of lists.flat()) if (!byId.has(row.id ?? row)) byId.set(row.id ?? row, row);
	return [...byId.values()].sort((left, right) => {
		const [l, r] = [createdAtMs(left), createdAtMs(right)];
		return l === r ? 0 : (r > l ? 1 : -1);
	});
}

const MENTION_RE = /(?<![\w@])@([a-z0-9_]+(?:\.[a-z0-9_]+)*)/gi;

/** Distinct lowercased @handles in `content` (≤20). Skips emails (no word char before @). */
export function parseMentions(content) {
	const handles = new Set();
	for (const match of String(content ?? '').matchAll(MENTION_RE)) {
		handles.add(match[1].toLowerCase());
		if (handles.size >= 20) break;
	}
	return [...handles];
}

/** The caller's unguessable inbox key, or null before their identity row has one. */
export async function notifyTokenFor(config, fetchImpl, userId) {
	const rows = await rest(config, fetchImpl, `osionos_bridge_identities?user_id=eq.${userId}&select=notify_token&limit=1`);
	return Array.isArray(rows) && rows[0]?.notify_token ? rows[0].notify_token : null;
}

/** Per-user realtime inbox topic, keyed by the unguessable notify_token. */
export function userTopic(notifyToken) {
	return `user:${notifyToken}`;
}

/**
 * Insert notification rows + push a live frame to each recipient's per-user
 * topic. `notifs`: [{ recipientId, type, actorId?, actorName?, channelId?,
 * messageId?, preview? }]. One batch insert + one token lookup + N publishes.
 */
export async function emitNotifications(deps, config, notifs) {
	const valid = (Array.isArray(notifs) ? notifs : []).filter((n) => n && UUID_REGEX.test(String(n.recipientId)));
	if (valid.length === 0) return;
	await rest(config, deps.fetchImpl, 'osionos_notifications', {
		method: 'POST',
		body: valid.map((n) => ({
			user_id: n.recipientId, type: n.type, actor_id: n.actorId ?? null,
			channel_id: n.channelId ?? null, message_id: n.messageId ?? null,
			preview: typeof n.preview === 'string' ? n.preview.slice(0, 280) : null,
		})),
		prefer: 'return=minimal',
	});
	const ids = [...new Set(valid.map((n) => n.recipientId))];
	const tokenRows = await rest(config, deps.fetchImpl, `osionos_bridge_identities?user_id=in.(${ids.join(',')})&select=user_id,notify_token`);
	const tokenByUser = new Map((Array.isArray(tokenRows) ? tokenRows : []).map((r) => [r.user_id, r.notify_token]));
	for (const n of valid) {
		const token = tokenByUser.get(n.recipientId);
		if (!token) continue;
		await publishRealtime({
			topic: userTopic(token),
			eventType: 'notification_created',
			payload: { type: n.type, actorName: n.actorName ?? null, channelId: n.channelId ?? null, messageId: n.messageId ?? null, preview: n.preview ?? null },
			fetchImpl: deps.fetchImpl,
			env: deps.env,
		});
	}
}

/** display_name + profile for a set of user ids → Map(userId → {name, avatar}). */
export async function identitySummaries(config, fetchImpl, userIds) {
	const ids = [...new Set(userIds)].filter((id) => UUID_REGEX.test(String(id)));
	if (ids.length === 0) return new Map();
	const rows = await rest(
		config,
		fetchImpl,
		`osionos_people_directory?user_id=in.(${ids.join(',')})&select=user_id,display_name,profile,last_seen_at`,
	);
	const map = new Map();
	for (const row of Array.isArray(rows) ? rows : []) {
		const profile = row.profile && typeof row.profile === 'object' && !Array.isArray(row.profile) ? row.profile : {};
		map.set(row.user_id, {
			name: typeof row.display_name === 'string' && row.display_name ? row.display_name : 'Member',
			avatar: typeof profile.avatar === 'string' ? profile.avatar : null,
			lastSeenAt: row.last_seen_at ?? null,
		});
	}
	return map;
}
