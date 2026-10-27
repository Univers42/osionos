/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-keepalive-post.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * A fetch stand-in for the one request publishRealtime makes: a POST with a string body, plain
 * object headers and an AbortSignal. The global fetch (undici) closes an idle keep-alive socket
 * after 4 s, and the route to the realtime gateway opens a new TLS session over the tailnet for
 * every new connection: measured from the bridge container, publish p50 was 12 ms at 0-1 s idle
 * and 53 ms at 5 s idle (one sample hung 68 s). A node:http agent with keepAlive held the same
 * socket across idles of 5 to 90 s, every publish 11-20 ms.
 *
 * A request that fails on a reused socket (the peer closed it under us) is retried once, the
 * pattern in https://nodejs.org/api/http.html#requestreusedsocket, on a one-off connection outside
 * the pool: the pool may hold more sockets the peer closed in the same sweep. A fresh socket is
 * never retried.
 *
 * Caveat: an idle socket the far side dropped without a FIN/RST (a NAT timeout) is found only by
 * the caller's abort timeout, not by the retry.
 */

import http from 'node:http';
import https from 'node:https';

const AGENTS = {
	'http:': new http.Agent({ keepAlive: true, maxFreeSockets: 16 }),
	'https:': new https.Agent({ keepAlive: true, maxFreeSockets: 16 }),
};
const TRANSPORTS = { 'http:': http, 'https:': https };
const RESET_CODES = new Set(['ECONNRESET', 'EPIPE']);

// Errors raised by a reused socket the peer had already closed; the only ones worth one retry.
const staleSocketErrors = new WeakSet();

function isStaleSocketError(error, request) {
	return request.reusedSocket === true && (RESET_CODES.has(error?.code) || error?.message === 'socket hang up');
}

/** One POST attempt over `agent`; a stale-socket failure is tagged in `staleSocketErrors`. */
function attempt(target, init, agent) {
	const { headers, body, signal } = init;
	return new Promise((resolve, reject) => {
		const request = TRANSPORTS[target.protocol].request(target, {
			method: init.method,
			agent,
			headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
		});
		const onAbort = () => request.destroy(signal.reason);
		const settle = (done, value) => {
			signal?.removeEventListener('abort', onAbort);
			done(value);
		};
		request.setNoDelay(true);
		request.on('error', (error) => {
			if (isStaleSocketError(error, request)) staleSocketErrors.add(error);
			settle(reject, error);
		});
		request.on('response', (response) => {
			response.on('error', (error) => settle(reject, error));
			response.on('end', () => settle(resolve, { ok: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode }));
			response.resume();
		});
		signal?.addEventListener('abort', onAbort, { once: true });
		request.end(body);
	});
}

/** POST `init.body` to `url` over a pooled keep-alive socket; resolves `{ ok, status }`. */
export async function keepAliveFetch(url, init) {
	const target = new URL(url);
	if (!AGENTS[target.protocol]) throw new Error(`unsupported protocol ${target.protocol}`);
	init.signal?.throwIfAborted();
	try {
		return await attempt(target, init, AGENTS[target.protocol]);
	} catch (error) {
		if (!staleSocketErrors.has(error) || init.signal?.aborted) throw error;
		return attempt(target, init, false);
	}
}
