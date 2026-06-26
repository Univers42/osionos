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
 * is down. Env: REALTIME_PUBLISH_URL (default http://mini-baas-realtime:4000).
 */

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REST_TIMEOUT_MS = 2_500;
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
		signal: AbortSignal.timeout(REST_TIMEOUT_MS),
	});
	const text = await response.text().catch(() => '');
	if (!response.ok) {
		const status = response.status === 401 || response.status === 403 ? 403 : (response.status === 404 ? 404 : 502);
		throw httpError(`BaaS request failed with ${response.status}: ${text.slice(0, 160)}`, status);
	}
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/** Best-effort publish to the Rust realtime gateway; never throws. */
export async function publishRealtime({ topic, eventType, payload, fetchImpl = fetch, env = process.env }) {
	const base = (env.REALTIME_PUBLISH_URL ?? 'http://mini-baas-realtime:4000').replace(/\/$/, '');
	try {
		const response = await fetchImpl(`${base}/v1/publish`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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

/**
 * Auto-connect teammates: for every SHARED workspace the user belongs to (one
 * with at least one OTHER member), ensure an accepted source='colleague'
 * connection row exists for each co-member — without ever duplicating or
 * overwriting an existing edge. Best-effort + bounded: any failure is swallowed
 * (never throws into the request path), queries are capped, and a pre-existing
 * 'manual'/'blocked'/any-status row in EITHER direction is left untouched (we
 * SELECT the pair both ways first; we never write the generated pair_key).
 */
export async function ensureColleagueConnections(config, fetchImpl, userId) {
	if (!UUID_REGEX.test(String(userId))) return;
	try {
		// 1. Workspaces the user is a member of.
		const myRows = await rest(config, fetchImpl, `osionos_workspace_members?user_id=eq.${userId}&select=workspace_id&limit=200`);
		const workspaceIds = [...new Set((Array.isArray(myRows) ? myRows : []).map((row) => row.workspace_id).filter((id) => UUID_REGEX.test(String(id))))];
		if (workspaceIds.length === 0) return;
		// 2. Co-members of those workspaces (excludes the user → only SHARED teams yield rows).
		const coRows = await rest(config, fetchImpl, `osionos_workspace_members?workspace_id=in.(${workspaceIds.join(',')})&user_id=neq.${userId}&select=user_id&limit=500`);
		const coMembers = [...new Set((Array.isArray(coRows) ? coRows : []).map((row) => row.user_id).filter((id) => UUID_REGEX.test(String(id)) && id !== userId))];
		if (coMembers.length === 0) return;
		// 3. One SELECT for every existing edge touching the user (either direction).
		const existing = await rest(config, fetchImpl, `osionos_connections?or=(requester_id.eq.${userId},addressee_id.eq.${userId})&select=requester_id,addressee_id&limit=1000`);
		const paired = new Set();
		for (const row of Array.isArray(existing) ? existing : []) {
			paired.add(row.requester_id === userId ? row.addressee_id : row.requester_id);
		}
		const toInsert = coMembers.filter((peer) => !paired.has(peer));
		if (toInsert.length === 0) return;
		// 4. Insert the missing colleague edges. on_conflict=pair_key +
		//    resolution=ignore-duplicates guards the UNIQUE(pair_key) constraint
		//    against a concurrent insert / inverse-direction row (never overwrites).
		await rest(config, fetchImpl, 'osionos_connections?on_conflict=pair_key', {
			method: 'POST',
			body: toInsert.map((peer) => ({
				requester_id: userId,
				addressee_id: peer,
				status: 'accepted',
				source: 'colleague',
				responded_at: new Date().toISOString(),
			})),
			prefer: 'resolution=ignore-duplicates,return=minimal',
		});
	} catch (error) {
		console.warn(`[osionos-bridge] ensureColleagueConnections skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
	}
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
