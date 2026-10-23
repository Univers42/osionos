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
import { CHUNK_SIZE, idChunks, inFilter, runChunks } from './bridge-paging.mjs';
// bridge-avatar.mjs imports this module back (for the error shape and the JSON
// body), so the two modules form a cycle. It is safe: publicAvatar is a hoisted
// function declaration and every call into it happens at request time.
import { publicAvatar } from './bridge-avatar.mjs';
import { moderationMode } from './bridge-moderation.mjs';

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

/**
 * The number of rows a filtered read matches, without the rows: one request with
 * `Prefer: count=exact`, the total read from the `Content-Range` header.
 * A missing or malformed header is a 502 — a count that cannot be read is not a zero.
 */
export async function restCount(config, fetchImpl, path) {
	if (!config.baasUrl || !config.serviceKey) {
		throw httpError('osionos BaaS service-role access is not configured.', 503);
	}
	const response = await fetchImpl(`${config.baasUrl}/rest/v1/${path}`, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			apikey: config.serviceKey,
			Authorization: `Bearer ${config.serviceKey}`,
			Prefer: 'count=exact',
			Range: '0-0',
		},
		signal: AbortSignal.timeout(BAAS_FETCH_TIMEOUT_MS),
	});
	if (!response.ok) {
		const status = response.status === 401 || response.status === 403 ? 403 : (response.status === 404 ? 404 : 502);
		const text = await response.text().catch(() => '');
		throw httpError(`BaaS request failed with ${response.status}: ${text.slice(0, 160)}`, status);
	}
	const total = countFromRange(response.headers?.get?.('content-range'));
	if (total === null) throw httpError('The BaaS count header is missing or malformed.', 502);
	return total;
}

/** The total after the `/` of a `Content-Range` header; null when it is not a count. */
export function countFromRange(header) {
	if (typeof header !== 'string') return null;
	const match = /^(?:\*|\d+-\d+)\/(\d+)$/.exec(header.trim());
	return match ? Number(match[1]) : null;
}

/**
 * The rows of a read over `ids`, read in chunks of at most 50 with at most four requests in
 * flight. `read` answers the rows of one chunk; a chunk that fails fails the whole read,
 * unless the caller catches it per chunk (a best-effort read).
 */
export async function readInChunks(ids, read, { size = CHUNK_SIZE } = {}) {
	const parts = await runChunks(idChunks(ids, size), read);
	return parts.flatMap((part) => (Array.isArray(part) ? part : []));
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

/** One osionos_workspaces row (id, owner_id, name) or null. */
export async function fetchWorkspace(config, fetchImpl, workspaceId) {
	const rows = await rest(config, fetchImpl, `osionos_workspaces?id=eq.${workspaceId}&select=id,owner_id,name&limit=1`);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

/**
 * The owner, or a member whose row says `admin`. A plain member is a 403; a user with no
 * relation to the workspace gets the same 404 as a workspace that does not exist, so the
 * answer is no oracle for which workspace ids are real.
 */
export async function requireWorkspaceAdmin(config, fetchImpl, userId, workspaceId) {
	const workspace = await fetchWorkspace(config, fetchImpl, workspaceId);
	if (!workspace) throw httpError('Workspace not found.', 404);
	if (String(workspace.owner_id).toLowerCase() === String(userId).toLowerCase()) return { workspace, role: 'owner' };
	const membership = await workspaceMembership(config, fetchImpl, userId, workspaceId);
	if (!membership) throw httpError('Workspace not found.', 404);
	if (String(membership.role ?? '').toLowerCase() !== 'admin') {
		throw httpError('Only the workspace owner or an admin may do this.', 403);
	}
	return { workspace, role: 'admin', membership };
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
	const rows = others.length === 0 ? [] : await readInChunks(others, (chunk) => rest(
		config,
		fetchImpl,
		`osionos_workspace_members?user_id=eq.${session.userId}&${inFilter('workspace_id', chunk)}&select=workspace_id`,
	));
	return [...wanted.filter((id) => own.has(id)), ...rows.map((row) => String(row.workspace_id).toLowerCase())];
}

/**
 * Set of user ids hidden from the viewer because a block exists in EITHER
 * direction: someone who blocked the viewer, OR someone the viewer blocked.
 * Blocking is symmetric for visibility — used to hide those targets from
 * directory search / people / connection lists. Shared by bridge-social /
 * bridge-collab / bridge-profile so the block-aware filter lives in one place.
 */
export async function blockedViewerBy(config, fetchImpl, viewerId) {
	const self = String(viewerId ?? '').toLowerCase();
	if (!UUID_REGEX.test(self)) return new Set();
	const rows = await rest(
		config,
		fetchImpl,
		`osionos_user_blocks?or=(blocked_id.eq.${viewerId},blocker_id.eq.${viewerId})&select=blocker_id,blocked_id`,
	);
	const hidden = new Set();
	for (const row of Array.isArray(rows) ? rows : []) {
		// the "other" party in each block edge is the one to hide from the viewer;
		// ids are compared case-insensitively so a block row whose casing differs
		// still hides its subject.
		const blocker = String(row?.blocker_id ?? '').toLowerCase();
		const blocked = String(row?.blocked_id ?? '').toLowerCase();
		const other = blocker === self ? blocked : (blocked === self ? blocker : null);
		if (other) hidden.add(other);
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

/** Every edge touching `userId`, newest first, whatever its status: the sync and the list share this read. */
export function connectionEdgesPath(userId) {
	return `osionos_connections?or=(requester_id.eq.${userId},addressee_id.eq.${userId})&select=*&order=created_at.desc`;
}

const createdAtMs = (row) => {
	const ms = Date.parse(row.created_at);
	return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
};

/** The edge rows of one read: one row per id, newest created_at first. */
export function edgesNewestFirst(rows) {
	const byId = new Map();
	for (const row of Array.isArray(rows) ? rows : []) if (!byId.has(row.id ?? row)) byId.set(row.id ?? row, row);
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
	// The token lookup is best-effort per chunk: a chunk that fails costs its recipients the
	// live toast, never the notifications that are already stored.
	const tokenRows = await readInChunks(ids, async (chunk) => {
		try {
			const rows = await rest(config, deps.fetchImpl, `osionos_bridge_identities?${inFilter('user_id', chunk)}&select=user_id,notify_token`);
			return Array.isArray(rows) ? rows : [];
		} catch (error) {
			console.warn(`[osionos-bridge] notification token lookup skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
			return [];
		}
	});
	const tokenByUser = new Map(tokenRows.map((r) => [r.user_id, r.notify_token]));
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

/** display_name + profile for a set of user ids → Map(userId → {name, avatar, headline}). */
export async function identitySummaries(config, fetchImpl, userIds) {
	const ids = [...new Set(userIds)].filter((id) => UUID_REGEX.test(String(id)));
	if (ids.length === 0) return new Map();
	const rows = await readInChunks(ids, async (chunk) => {
		const part = await rest(
			config,
			fetchImpl,
			`osionos_people_directory?${inFilter('user_id', chunk)}&select=user_id,display_name,profile`,
		);
		return Array.isArray(part) ? part : [];
	});
	const map = new Map();
	for (const row of rows) {
		const profile = row.profile && typeof row.profile === 'object' && !Array.isArray(row.profile) ? row.profile : {};
		map.set(row.user_id, {
			name: typeof row.display_name === 'string' && row.display_name ? row.display_name : 'Member',
			// The ONE projection of a user avatar: a `data:` URL never leaves the bridge.
			avatar: publicAvatar(typeof profile.avatar === 'string' ? profile.avatar : null, config),
			headline: typeof profile.headline === 'string' ? profile.headline : null,
		});
	}
	return map;
}

/**
 * C94: is this subject PUBLIC-readable? The page is public, or the page's
 * WORKSPACE is public — the SAME rule the M4b enqueue trigger uses, so the
 * bridge and the trigger never disagree about what is in scope.
 *
 * A private page of a confidential workspace is not: an automated scan of it is
 * out of scope, and the moderation must not become a way to read it. A row
 * that is not there (a live-database id) is not public either.
 *
 * @param {{ visibility?: unknown, workspace_id?: unknown } | null} page the page row
 */
export async function publicReadablePage(config, fetchImpl, page) {
	if (!page) return false;
	if (page.visibility === 'public') return true;
	const workspaceId = page.workspace_id;
	if (typeof workspaceId !== 'string' || !workspaceId) return false;
	const rows = await rest(config, fetchImpl, `osionos_workspaces?id=eq.${workspaceId}&select=visibility&limit=1`);
	const workspace = Array.isArray(rows) ? rows[0] : null;
	return workspace?.visibility === 'public';
}

/**
 * The 409 a write answers when L0 wants the author's answer first (C85). The
 * CODES and the matched TERMS go back to the AUTHOR, who is the only one who
 * may see them (C94): the terms are their own words, and the codes are what a
 * console would later show without them.
 *
 * `details` carries the same two lists because the app's HTTP client keeps the
 * error envelope's known fields only (message, code, details) — a flat
 * `reasons`/`terms` would be dropped on the way to the author's UI.
 */
export function moderationWarningBody(decision) {
	return {
		ok: false,
		code: 'moderation_warning',
		message: 'This may hurt someone. Edit it, or post it anyway.',
		reasons: decision.codes,
		terms: decision.terms,
		details: { reasons: decision.codes, terms: decision.terms },
	};
}

/**
 * The moderation mode and the state flag, read where a handler reads its
 * config. The flag OSIONOS_MODERATION_STATE=1 goes on only AFTER the groot
 * migration that adds moderation_state and ai_moderation_events: the readers'
 * `or=` filter 400s against a database without the column.
 */
export function moderationSettings(env) {
	return { mode: moderationMode(env), stateEnabled: env?.OSIONOS_MODERATION_STATE === '1' };
}

/**
 * The reader filter (C87): a comment nobody held, or the caller's own — so a
 * held comment is seen by its author and by nobody else. Added ONLY when the
 * state column exists: the filter names moderation_state, and PostgREST 400s
 * on a column the database does not have.
 */
export function visibleOrOwnFilter(session, stateEnabled) {
	return stateEnabled ? `&or=(moderation_state.eq.visible,author_id.eq.${session.userId})` : '';
}
