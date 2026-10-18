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
 * The body names what to follow ({kind:'chat',channelId} | {kind:'user',subject?}),
 * never a topic: the topic is built here from a checked grant, so no client can
 * ask for feed:, presence:, collab:, table:, a wildcard or someone else's inbox.
 *
 * Caveat: the realtime gateway checks `exp` only at AUTH, so an open subscription
 * outlives its token and survives the user's removal from the channel until the
 * socket closes. The 900 s TTL bounds how long a stolen token can open new ones.
 */

import { UUID_REGEX, bearerToken, httpError, notifyTokenFor, readJsonBody, sendJson, userTopic } from './bridge-social-core.mjs';
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

async function resolveTopic(deps, session, body, config) {
	// A JSON `null`, number or array parses fine but has no `kind`; reading it threw a TypeError.
	if (body === null || typeof body !== 'object' || Array.isArray(body)) throw forbidden();
	if (body.kind === 'chat') return chatTopicFor(deps, session, body, config);
	if (body.kind === 'user') return userTopicFor(deps, session, body, config);
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

/** Build the dispatcher: `await handler(url, request, response)` → true when handled. */
export function createRealtimeTokenHandler({ config, verifySession, fetchImpl = fetch, env = process.env }) {
	const deps = { fetchImpl, env };
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
