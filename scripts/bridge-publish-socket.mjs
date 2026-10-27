/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-publish-socket.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Per-publish route choice for the realtime gateway. publishRealtime POSTs every event
 * (co-edit, presence, notifications) to the gateway, and that POST today crosses Tailscale
 * (~10 ms p50); an ssh -L forward exposes the same gateway as a local unix socket (~0.4 ms).
 * When REALTIME_PUBLISH_SOCKET names that socket, send() posts through it under its own short
 * deadline; when the socket is missing or misbehaving, a circuit breaker hands every publish
 * back to the URL route (send() resolves null) for BREAKER_OPEN_MS, then lets exactly one
 * probe through.
 *
 * A connect failure (ENOENT / ECONNREFUSED / EACCES / ENOTSOCK) happens before anything was
 * written, so the caller still delivers this event over the URL (S8). Any other failure may
 * have written the request already, so it is reported failed and never re-sent. state()
 * exposes only the route and the errno class, never the socket path: it is a host path (S11).
 *
 * Caveat: a timeout cannot tell "not delivered" from "delivered late", so that one event is
 * reported failed and never re-sent; and the breaker is per process, so each replica learns
 * alone.
 */

import { keepAliveFetch } from './bridge-keepalive-post.mjs';

/** The socket's own deadline: the local hop is sub-millisecond, so this only catches a hung peer. */
export const SOCKET_TIMEOUT_MS = 300;

/** How long a tripped breaker forces every publish onto the URL route before one probe. */
export const BREAKER_OPEN_MS = 30_000;

// Errno codes raised before anything was written to the socket: safe to hand the event back
// to the URL route.
const PRE_SEND = new Set(['ENOENT', 'ECONNREFUSED', 'EACCES', 'ENOTSOCK']);

// One route per socket path: the breaker is per-path state, and rebuilding it per publish
// would forget every failure.
const ROUTES = new Map();

/** Whether this call may hit the socket; marks it as the one probe once the open period is over. */
function maySend(breaker, now) {
	if (breaker.openUntil === null) return true;
	if (now() < breaker.openUntil || breaker.probing) return false;
	breaker.probing = true;
	return true;
}

/** One publish over the socket: the response, null (use the URL), or { ok: false, status: 0 }. */
async function sendOverSocket(config, breaker, url, init) {
	if (!maySend(breaker, config.now)) return null;
	try {
		// The caller's signal is replaced, never combined: the socket has its own, shorter
		// deadline, and the caller's budget belongs to the URL fallback.
		const response = await config.post(url, { ...init, signal: AbortSignal.timeout(config.timeoutMs) }, config.socketPath);
		breaker.openUntil = null;
		breaker.lastError = null;
		breaker.probing = false;
		return response;
	} catch (error) {
		breaker.openUntil = config.now() + config.openMs;
		breaker.lastError = error?.code || error?.name || 'Error';
		breaker.probing = false;
		return PRE_SEND.has(error?.code) ? null : { ok: false, status: 0 };
	}
}

/** A socket route over `socketPath`: send(url, init) to publish, state() for health. Never throws. */
export function createSocketRoute({ socketPath, post = keepAliveFetch, now = Date.now, timeoutMs = SOCKET_TIMEOUT_MS, openMs = BREAKER_OPEN_MS }) {
	const config = { socketPath, post, now, timeoutMs, openMs };
	const breaker = { openUntil: null, lastError: null, probing: false };
	return {
		send: (url, init) => sendOverSocket(config, breaker, url, init),
		state: () => ({ route: breaker.openUntil !== null ? 'socket-breaker-open' : 'socket', last_error: breaker.lastError }),
	};
}

/** The singleton socket route for REALTIME_PUBLISH_SOCKET, or null when unset or blank. */
export function socketPublishRoute(env = process.env) {
	const path = String(env.REALTIME_PUBLISH_SOCKET ?? '').trim();
	if (path === '') return null;
	let route = ROUTES.get(path);
	if (route === undefined) {
		route = createSocketRoute({ socketPath: path });
		ROUTES.set(path, route);
	}
	return route;
}
