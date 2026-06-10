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

/** display_name + profile for a set of user ids → Map(userId → {name, avatar}). */
export async function identitySummaries(config, fetchImpl, userIds) {
	const ids = [...new Set(userIds)].filter((id) => UUID_REGEX.test(String(id)));
	if (ids.length === 0) return new Map();
	const rows = await rest(
		config,
		fetchImpl,
		`osionos_bridge_identities?user_id=in.(${ids.join(',')})&select=user_id,display_name,profile,last_seen_at`,
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
