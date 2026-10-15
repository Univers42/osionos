/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-realtime-socket.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/15 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Realtime publishing over grobase's public WebSocket, for a bridge that reaches grobase only
 * through Tailscale Funnel. There the WAF refuses POST /realtime/v1/publish (rule 10130: through
 * Funnel the VM loopback passes Kong's ip-restriction, so the service key alone would publish
 * from the internet), while /realtime/v1/ws stays open: the socket authenticates with a JWT the
 * bridge mints from JWT_SECRET, and no service key crosses the internet.
 *
 * One socket per URL: AUTH, wait for AUTH_OK, then PUBLISH frames. A PING every 25 s keeps it
 * open: the WAF closes a socket after 60 s without traffic, and a can_subscribe:false socket
 * receives nothing. The token lives 15 minutes; the socket re-AUTHs 2 minutes before it ends.
 *
 * Caveat: the gateway acks no PUBLISH, so a frame written as the socket drops is lost without a
 * trace; and while the socket is down the queue holds 256 events — past that the oldest are
 * dropped (counted, logged at most once a minute). A subscriber that missed one sees the change
 * on its next refetch. A payload over 65,536 bytes is refused here, where the gateway would
 * drop it without a word.
 */

import { createHmac } from 'node:crypto';

export const REALTIME_TOKEN_ISSUER = 'grobase-realtime';
const PUBLISHER_SUBJECT = 'osionos-bridge';
const MAX_PAYLOAD_BYTES = 65_536;
const CONNECTING = 0;
const OPEN = 1;
const DEFAULT_TIMING = {
	tokenTtlSeconds: 900,
	reauthLeadMs: 120_000,
	pingIntervalMs: 25_000,
	queueLimit: 256,
	backoffFirstMs: 500,
	backoffCapMs: 30_000,
	dropLogIntervalMs: 60_000,
};

const b64urlJson = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const unref = (timer) => {
	timer.unref?.();
	return timer;
};
const brief = (value) => String(value ?? '').slice(0, 160);

/** HS256-sign `claims` with the gateway's REALTIME_JWT_SECRET (grobase's JWT_SECRET). */
export function signRealtimeJwt(claims, secret) {
	const signingInput = `${b64urlJson({ alg: 'HS256', typ: 'JWT' })}.${b64urlJson(claims)}`;
	return `${signingInput}.${createHmac('sha256', secret).update(signingInput).digest('base64url')}`;
}

/** Publish anywhere, subscribe nowhere. `["*"]` reaches collab: and xapp: too, because baas
 *  protects no namespace (REALTIME_PROTECTED_NAMESPACES empty): the REST route's reach. */
export function publisherClaims(nowMs, ttlSeconds = DEFAULT_TIMING.tokenTtlSeconds) {
	const iat = Math.floor(nowMs / 1000);
	return { iss: REALTIME_TOKEN_ISSUER, sub: PUBLISHER_SUBJECT, can_publish: true, can_subscribe: false, namespaces: ['*'], iat, exp: iat + ttlSeconds };
}

function hostOf(url) {
	try {
		return new URL(url).host;
	} catch {
		return 'an invalid URL';
	}
}

export class RealtimeSocketPublisher {
	#url;
	#host;
	#secret;
	#log;
	#timing;
	#WebSocket;
	#queue = [];
	#socket = null;
	#ready = false;
	#failures = 0;
	#nextAttemptAt = 0;
	#timers = { reconnect: null, ping: null, reauth: null };
	#dropped = 0;
	#lastDropLogAt = -Infinity;
	#warnedNoSecret = false;
	#closed = false;

	constructor({ url, secret, log = console.warn, timing = {}, WebSocketImpl = globalThis.WebSocket }) {
		this.#url = url;
		this.#host = hostOf(url);
		this.#secret = secret;
		this.#log = log;
		this.#timing = { ...DEFAULT_TIMING, ...timing };
		this.#WebSocket = WebSocketImpl;
	}

	get droppedCount() {
		return this.#dropped;
	}

	/** Queue one event and send it once the socket is authenticated; never throws. */
	publish(topic, eventType, payload) {
		if (!this.#secret) return this.#refuseWithoutSecret();
		let size;
		try {
			size = Buffer.byteLength(JSON.stringify(payload ?? null));
		} catch (error) {
			this.#log(`[osionos-bridge] realtime publish ${topic} refused: ${brief(error?.message)}`);
			return false;
		}
		if (size > MAX_PAYLOAD_BYTES) {
			this.#log(`[osionos-bridge] realtime publish ${topic} refused: payload is ${size} bytes, over the gateway's ${MAX_PAYLOAD_BYTES}`);
			return false;
		}
		this.#enqueue({ type: 'PUBLISH', topic, event_type: eventType, payload: payload ?? null });
		if (this.#isReady()) this.#flush();
		else this.#scheduleConnect();
		return true;
	}

	close() {
		this.#closed = true;
		clearTimeout(this.#timers.reconnect);
		clearInterval(this.#timers.ping);
		clearTimeout(this.#timers.reauth);
		this.#queue.length = 0;
		this.#socket?.close();
		this.#socket = null;
	}

	#refuseWithoutSecret() {
		if (!this.#warnedNoSecret) {
			this.#warnedNoSecret = true;
			this.#log('[osionos-bridge] realtime publish over the socket is off: JWT_SECRET is not set');
		}
		return false;
	}

	#enqueue(frame) {
		this.#queue.push(frame);
		if (this.#queue.length <= this.#timing.queueLimit) return;
		this.#queue.shift();
		this.#dropped += 1;
		const now = Date.now();
		if (now - this.#lastDropLogAt < this.#timing.dropLogIntervalMs) return;
		this.#lastDropLogAt = now;
		this.#log(`[osionos-bridge] realtime socket to ${this.#host} is down: ${this.#dropped} queued events dropped so far`);
	}

	#isReady() {
		return this.#ready && this.#socket?.readyState === OPEN;
	}

	#flush() {
		while (this.#queue.length > 0 && this.#isReady()) this.#socket.send(JSON.stringify(this.#queue.shift()));
	}

	#scheduleConnect() {
		if (this.#closed || this.#socket || this.#timers.reconnect) return;
		const delay = Math.max(0, this.#nextAttemptAt - Date.now());
		this.#timers.reconnect = unref(setTimeout(() => {
			this.#timers.reconnect = null;
			this.#connect();
		}, delay));
	}

	#connect() {
		if (this.#closed || this.#socket) return;
		let socket;
		try {
			socket = new this.#WebSocket(this.#url);
		} catch (error) {
			this.#failed(`cannot open: ${brief(error?.message)}`);
			if (this.#queue.length > 0) this.#scheduleConnect();
			return;
		}
		this.#socket = socket;
		this.#ready = false;
		const session = { authenticated: false, refused: false };
		socket.addEventListener('open', () => {
			if (socket === this.#socket) this.#authenticate(socket);
			else socket.close();
		});
		socket.addEventListener('message', (event) => this.#onFrame(socket, session, event.data));
		socket.addEventListener('close', (event) => this.#onClose(socket, session, event.code));
		// A refused connection fires `error` and never `close` (Node 22.23's WebSocket, measured
		// 2026-10-15): without this the publisher waited on that socket forever.
		socket.addEventListener('error', () => {
			if (socket.readyState === CONNECTING) this.#onClose(socket, session, 1006);
		});
	}

	#authenticate(socket) {
		const claims = publisherClaims(Date.now(), this.#timing.tokenTtlSeconds);
		socket.send(JSON.stringify({ type: 'AUTH', token: signRealtimeJwt(claims, this.#secret) }));
	}

	#onFrame(socket, session, data) {
		let frame;
		try {
			frame = JSON.parse(String(data));
		} catch {
			return;
		}
		if (frame?.type === 'AUTH_OK') {
			this.#onAuthenticated(socket, session);
			return;
		}
		if (frame?.type !== 'ERROR') return;
		if (frame.code === 'AUTH_FAILED') session.refused = true;
		this.#log(`[osionos-bridge] realtime socket to ${this.#host}: ${brief(frame.code)} ${brief(frame.message)}`);
	}

	#onAuthenticated(socket, session) {
		if (socket !== this.#socket) return;
		if (!session.authenticated) {
			session.authenticated = true;
			this.#timers.ping = unref(setInterval(() => {
				if (this.#isCurrentOpen(socket)) socket.send('{"type":"PING"}');
			}, this.#timing.pingIntervalMs));
		}
		this.#ready = true;
		this.#failures = 0;
		this.#nextAttemptAt = 0;
		clearTimeout(this.#timers.reauth);
		const reauthInMs = Math.max(1_000, this.#timing.tokenTtlSeconds * 1000 - this.#timing.reauthLeadMs);
		this.#timers.reauth = unref(setTimeout(() => {
			if (this.#isCurrentOpen(socket)) this.#authenticate(socket);
		}, reauthInMs));
		this.#flush();
	}

	#isCurrentOpen(socket) {
		return socket === this.#socket && socket.readyState === OPEN;
	}

	#onClose(socket, session, code) {
		if (socket !== this.#socket) return;
		this.#socket = null;
		this.#ready = false;
		clearInterval(this.#timers.ping);
		clearTimeout(this.#timers.reauth);
		if (this.#closed) return;
		if (session.refused) this.#failed(`refused the token (close ${code})`);
		else if (!session.authenticated) this.#failed(`closed with ${code} before AUTH_OK`);
		if (this.#queue.length > 0) this.#scheduleConnect();
	}

	#failed(reason) {
		this.#failures += 1;
		const backoffMs = Math.min(this.#timing.backoffCapMs, this.#timing.backoffFirstMs * 2 ** (this.#failures - 1));
		this.#nextAttemptAt = Date.now() + backoffMs;
		this.#log(`[osionos-bridge] realtime socket to ${this.#host} ${reason}; next attempt in ${backoffMs} ms`);
	}
}

const publishers = new Map();

/** The process's one publisher for `url`, signing with JWT_SECRET (REALTIME_JWT_SECRET as a
 *  fallback, as bridge-collab mints its tokens). */
export function realtimeSocketPublisher(url, env) {
	let publisher = publishers.get(url);
	if (!publisher) {
		publisher = new RealtimeSocketPublisher({ url, secret: String(env.JWT_SECRET ?? env.REALTIME_JWT_SECRET ?? '').trim() });
		publishers.set(url, publisher);
	}
	return publisher;
}

/** Close every socket publisher (shutdown, tests). */
export function closeRealtimeSocketPublishers() {
	for (const publisher of publishers.values()) publisher.close();
	publishers.clear();
}
