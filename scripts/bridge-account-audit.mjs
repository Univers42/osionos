/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-audit.mjs                            +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The audit viewer API: GET /api/account/admin/audit, a keyset list over
 * `osionos_bridge_audit_events` (the rows bridge-guard.mjs writeAudit writes).
 *
 * Who may call: a session whose platform role, RE-READ from `public.user_roles` on every
 * request, is admin. The role claim in the token never grants here. Every other caller gets
 * 403 admin_required before the audit table is read.
 *
 * What an admin sees: time, actor, event type, subject, provider and a sanitised `details`.
 * `ip_hash` and `user_agent` are not in the select, and a details key that names a token, a
 * secret, an address or an email is dropped from the answer.
 *
 * Caveat: the details filter matches key NAMES. A value stored under an innocent key (an email
 * under `note`) is returned as it was written; writeAudit callers are the ones who keep such
 * values out. Values are cut at 200 characters, so a long value is shown truncated.
 * Caveat: the scan is `provider=eq.osionos` ordered by `created_at desc, id desc`; a very
 * large table with many rows of another provider reads past them.
 */

import { rateLimit } from './bridge-guard.mjs';
import { decodeCursor, keyset, pageOf } from './bridge-paging.mjs';
import { isPlatformRole, readPlatformRole, roleAtLeast } from './bridge-roles.mjs';
import { UUID_REGEX, bearerToken, sendJson } from './bridge-social-core.mjs';

const AUDIT_PATH = '/api/account/admin/audit';
const SELECT = 'id,created_at,event_type,actor_id,subject,provider,details';
const ORDER = [['created_at', 'desc'], ['id', 'desc']];
const EVENT_TYPE = /^[a-z0-9_.:-]{1,64}$/i;
const SECRET_KEY = /token|secret|password|code|cookie|authorization|(^|_)ip|ipprefix|email|agent|hash/i;
const MAX_VALUE = 200;
const MAX_KEYS = 20;
const READ_LIMIT = 60;
const WINDOW_MS = 60_000;

const auditError = (status, code, message) => Object.assign(new Error(message), { status, code });

function safeValue(value) {
	if (typeof value === 'string') return value.slice(0, MAX_VALUE);
	if (typeof value === 'number' || typeof value === 'boolean') return value;
	if (Array.isArray(value)) return value.filter((item) => typeof item === 'string' || typeof item === 'number').slice(0, MAX_KEYS).map((item) => safeValue(item));
	return undefined;
}

/** The details object as the panel may show it: scalar values and flat lists, no sensitive key. */
export function safeDetails(details) {
	if (typeof details !== 'object' || details === null || Array.isArray(details)) return {};
	const out = {};
	for (const [key, value] of Object.entries(details).slice(0, MAX_KEYS)) {
		if (SECRET_KEY.test(key)) continue;
		const shown = safeValue(value);
		if (shown !== undefined) out[key] = shown;
	}
	return out;
}

function auditEntry(row) {
	return {
		id: String(row.id),
		createdAt: row.created_at ?? null,
		eventType: row.event_type ?? '',
		actorId: row.actor_id ?? null,
		subject: row.subject ?? null,
		provider: row.provider ?? null,
		details: safeDetails(row.details),
	};
}

/** The caller's filters as PostgREST terms; a malformed value is refused, never passed on. */
function filtersOf(url) {
	const terms = ['provider=eq.osionos'];
	const eventType = url.searchParams.get('eventType');
	if (eventType) {
		if (!EVENT_TYPE.test(eventType)) throw auditError(422, 'invalid_event_type', 'The event type is not a valid name.');
		terms.push(`event_type=eq.${encodeURIComponent(eventType)}`);
	}
	const actorId = url.searchParams.get('actorId');
	if (actorId) {
		if (!UUID_REGEX.test(actorId)) throw auditError(422, 'invalid_actor_id', 'The actor id must be a UUID.');
		terms.push(`actor_id=eq.${actorId.toLowerCase()}`);
	}
	return terms.join('&');
}

async function listEvents({ client, config }, url, response) {
	const filters = filtersOf(url);
	const rawCursor = url.searchParams.get('cursor');
	const cursor = rawCursor ? decodeCursor(rawCursor, ORDER.length) : undefined;
	const { query, take } = keyset({ order: ORDER, cursor, limit: url.searchParams.get('limit') });
	const rows = await client.get(`osionos_bridge_audit_events?select=${SELECT}&${filters}&${query}`);
	const page = pageOf(Array.isArray(rows) ? rows : [], ORDER, take);
	return sendJson(response, 200, { ok: true, events: page.items.map(auditEntry), nextCursor: page.nextCursor }, config);
}

async function throttled({ kv, config }, userId, response) {
	try {
		await rateLimit(kv, ['admin-audit', 'read', userId], { limit: READ_LIMIT, windowMs: WINDOW_MS });
	} catch (error) {
		if (error?.status !== 429) throw error;
		const retryAfterSeconds = Number.isFinite(error?.retryAfterSeconds) ? error.retryAfterSeconds : WINDOW_MS / 1_000;
		response.setHeader('retry-after', String(retryAfterSeconds));
		sendJson(response, 429, { ok: false, message: 'Too many requests.', code: 'rate_limited', retryAfterSeconds }, config);
		return true;
	}
	return false;
}

export function createAdminAuditRoutes({ config, pg, kv, verifySession }) {
	return async function handleAdminAudit(url, request, response) {
		if (url.pathname !== AUDIT_PATH || request.method !== 'GET') return false;
		const session = verifySession(bearerToken(request), config);
		const client = pg.asService();
		const { role } = await readPlatformRole(client, session.userId);
		if (!isPlatformRole(role) || !roleAtLeast(role, 'admin')) throw auditError(403, 'admin_required', 'This action needs the admin role.');
		if (await throttled({ kv, config }, session.userId, response)) return true;
		return listEvents({ client, config }, url, response);
	};
}
