/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-realtime-token.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * `POST /api/realtime/token` — a subscribe-only realtime token for ONE topic the
 * caller may read, so the public build ships no baked VITE_BAAS_REALTIME_TOKEN.
 * The body names what to follow, never a topic:
 *   {kind:'chat', channelId}         → chat:<workspace>:<channel>
 *   {kind:'user', subject?}           → user:<userId> | user:<notify_token>
 *   {kind:'table', dbId, table}       → table:<dbId>:<table>   (a mounted live DB)
 *   {kind:'objectdb'}                 → objectdb:<caller's own user id>
 * The topic is built here from a checked grant, so no client can ask for feed:,
 * presence:, collab:, a wildcard or someone else's inbox.
 *
 * Caveat: the realtime gateway checks `exp` only at AUTH, so an open subscription
 * outlives its token and survives the user's removal from the channel until the
 * socket closes. The 900 s TTL bounds how long a stolen token can open new ones.
 */

import { QUERY_ROUTER_TABLE, UUID_REGEX, bearerToken, httpError, notifyTokenFor, readJsonBody, sendJson, userTopic } from './bridge-social-core.mjs';
import { chatTopic, requireChannelAccess } from './bridge-chat.mjs';
import { mintRealtimeToken } from './bridge-collab.mjs';
import { takeToken } from './bridge-ratelimit.mjs';

const REALTIME_TOKEN_TTL_SECONDS = 900;
// A chat client asks once per open channel plus once per reconnect; 60 covers a
// workspace switch, 1/s refill stops a reconnect storm from hammering the DB.
const TOKEN_BUCKET = { capacity: 60, refillPerSec: 1 };

function forbidden(message = 'That realtime topic is not available to you.') {
	return httpError(message, 403);
}

async function chatTopicFor(deps, session, body, config) {
	const channelId = String(body.channelId ?? '');
	if (!UUID_REGEX.test(channelId)) throw forbidden();
	const { channel } = await requireChannelAccess(config, deps.fetchImpl, session.userId, channelId);
	return chatTopic(channel);
}

// The app subscribes to both `user:<id>` (connection requests) and
// `user:<notify_token>` (inbox); each is granted only to its owner.
async function userTopicFor(deps, session, body, config) {
	const subject = body.subject === undefined ? session.userId : String(body.subject);
	if (subject.toLowerCase() === session.userId) return `user:${session.userId}`;
	const ownToken = await notifyTokenFor(config, deps.fetchImpl, session.userId);
	if (!ownToken || subject !== ownToken) throw forbidden();
	return userTopic(ownToken);
}

// A live database mounted in a workspace: `table:<dbId>:<table>`. The dbId must be a
// mount of a workspace the caller owns or is a member of — the SAME rule as
// resolveAccessibleMount in bridge-api.mjs. That check is INJECTED (mountAccess):
// this module must not import bridge-api.mjs, which imports this one.
async function tableTopicFor(deps, session, body) {
	const dbId = String(body.dbId ?? '');
	const table = String(body.table ?? '');
	if (!UUID_REGEX.test(dbId) || !QUERY_ROUTER_TABLE.test(table)) throw forbidden();
	if (typeof deps.mountAccess !== 'function') throw forbidden();
	if (!await deps.mountAccess(session, dbId)) throw forbidden();
	return `table:${dbId}:${table}`;
}

// The caller's OWN object-database stream. Any subject/ownerId in the body is ignored:
// the topic is always the caller's own id, never another user's.
function objectDbTopicFor(session) {
	return `objectdb:${session.userId}`;
}

async function resolveTopic(deps, session, body, config) {
	// A JSON `null`, number or array parses fine but has no `kind`; reading it threw a TypeError.
	if (body === null || typeof body !== 'object' || Array.isArray(body)) throw forbidden();
	if (body.kind === 'chat') return chatTopicFor(deps, session, body, config);
	if (body.kind === 'user') return userTopicFor(deps, session, body, config);
	if (body.kind === 'table') return tableTopicFor(deps, session, body);
	if (body.kind === 'objectdb') return objectDbTopicFor(session);
	throw forbidden();
}

async function issueToken(deps, session, request, response, config) {
	takeToken(`realtime-token:${session.userId}`, TOKEN_BUCKET);
	const body = await readJsonBody(request);
	const topic = await resolveTopic(deps, session, body, config);
	const { token, expiresAt } = mintRealtimeToken({
		secret: deps.env.JWT_SECRET ?? deps.env.REALTIME_JWT_SECRET,
		userId: session.userId,
		namespaces: [topic],
		ttlSeconds: REALTIME_TOKEN_TTL_SECONDS,
		canPublish: false,
	});
	return sendJson(response, 200, { ok: true, token, expiresAt, topic }, config);
}

/**
 * Build the dispatcher: `await handler(url, request, response)` → true when handled.
 *
 * `mountAccess(session, dbId)` → true when the dbId is a mount of a workspace the
 * caller owns or is a member of. It is injected (bridge-api.mjs builds it from the
 * same functions resolveAccessibleMount uses) because this module must not import
 * bridge-api.mjs — that module imports this one. Without it the `table` grant is
 * refused, never guessed.
 */
export function createRealtimeTokenHandler({ config, verifySession, fetchImpl = fetch, env = process.env, mountAccess }) {
	const deps = { fetchImpl, env, mountAccess };
	return async function handleRealtimeTokenRoute(url, request, response, requestConfig = config) {
		if (url.pathname !== '/api/realtime/token') return false;
		try {
			if ((request.method || 'GET').toUpperCase() !== 'POST') {
				return sendJson(response, 405, { ok: false, message: 'Method not supported here.' }, requestConfig);
			}
			const session = verifySession(bearerToken(request), requestConfig);
			return await issueToken(deps, session, request, response, requestConfig);
		} catch (error) {
			return sendJson(response, error?.status ?? 500, { ok: false, message: error instanceof Error ? error.message : 'Realtime token request failed.' }, requestConfig);
		}
	};
}
