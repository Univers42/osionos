/**
 * Opt-in socket lane in front of the HTTP /v1/publish: with REALTIME_PUBLISH_WS_URL set (next
 * to the http REALTIME_PUBLISH_URL), publishRealtime writes to one authenticated socket and
 * falls back to HTTP whenever the socket is not open, its send buffer is backed up, the lane's
 * startup canary has not passed, or REALTIME_PUBLISH_NAMESPACES grants nothing. Unset = today's
 * behaviour, byte for byte.
 *
 * The token grants exactly the namespaces in REALTIME_PUBLISH_NAMESPACES (comma list, never
 * '*') plus one throw-away canary namespace. Caveat: the gateway matches a grant against the
 * whole topic before its first '/', so `collab:<workspace>` and `collabpage:<page>` need one
 * grant per workspace and page: this lane cannot cover per-id topics while those prefixes are
 * protected (docs/realtime-publish-namespaces.md).
 *
 * The canary subscribes on its own socket, publishes through the lane and waits for the echo.
 * Caveat: it proves the path once at startup. A later silent loss is not seen until a restart;
 * until the canary passes, and after it fails, every publish takes HTTP.
 */

import { randomUUID } from 'node:crypto';
import { RealtimeSocketPublisher, REALTIME_TOKEN_ISSUER, signRealtimeJwt } from './bridge-realtime-socket.mjs';

const CANARY_TIMEOUT_MS = 5_000;
const CANARY_RETRY_MS = 50;
const lanes = new Map();

/** The exact namespaces of REALTIME_PUBLISH_NAMESPACES; a '*' entry is dropped, never honoured. */
export function exactNamespaces(raw) {
	return String(raw ?? '').split(',').map((entry) => entry.trim()).filter((entry) => entry && entry !== '*');
}

function secretOf(env) {
	return String(env.JWT_SECRET ?? env.REALTIME_JWT_SECRET ?? '').trim();
}

/** The lane for `env`, or null when REALTIME_PUBLISH_WS_URL is unset or not a ws(s) URL. */
export function realtimeWsLane(env, overrides = {}) {
	const url = String(env.REALTIME_PUBLISH_WS_URL ?? '').trim();
	if (!/^wss?:\/\//i.test(url)) return null;
	let lane = lanes.get(url);
	if (!lane) {
		const granted = exactNamespaces(env.REALTIME_PUBLISH_NAMESPACES);
		const canaryNamespace = `bridgecanary:${randomUUID()}`;
		const publisher = new RealtimeSocketPublisher({ url, secret: secretOf(env), namespaces: [...granted, canaryNamespace], ...overrides });
		lane = { url, granted, canaryNamespace, publisher, status: granted.length ? 'pending' : 'off', reason: granted.length ? '' : 'REALTIME_PUBLISH_NAMESPACES is empty' };
		lanes.set(url, lane);
	}
	return lane;
}

/**
 * Socket first; false = the caller must take HTTP. A topic whose namespace (up to the first '/')
 * is not granted is refused here: the gateway would drop it without an ack and nothing would
 * fall back.
 */
export function publishViaLane(env, topic, eventType, payload) {
	const lane = realtimeWsLane(env);
	if (!lane || lane.status !== 'ok') return false;
	if (!lane.granted.includes(String(topic).split('/')[0])) return false;
	return lane.publisher.publishIfReady(topic, eventType, payload);
}

/** What /api/auth/bridge/health reports for the lane: off | pending | ok | degraded. */
export function wsLaneHealth() {
	const [lane] = lanes.values();
	return lane ? { status: lane.status, ...(lane.reason ? { reason: lane.reason } : {}) } : { status: 'off' };
}

function subscriberClaims(namespace) {
	const iat = Math.floor(Date.now() / 1000);
	return { iss: REALTIME_TOKEN_ISSUER, sub: 'osionos-bridge-canary', can_publish: false, can_subscribe: true, namespaces: [namespace], iat, exp: iat + 60 };
}

function listenForEcho(lane, secret, WebSocketImpl, nonce, onResult) {
	const socket = new WebSocketImpl(lane.url);
	const send = (frame) => socket.send(JSON.stringify(frame));
	socket.addEventListener('open', () => send({ type: 'AUTH', token: signRealtimeJwt(subscriberClaims(lane.canaryNamespace), secret) }));
	socket.addEventListener('error', () => onResult(false, 'subscriber socket failed'));
	socket.addEventListener('close', () => onResult(false, 'subscriber socket closed'));
	socket.addEventListener('message', (event) => {
		let frame;
		try {
			frame = JSON.parse(String(event.data));
		} catch {
			return;
		}
		if (frame.type === 'AUTH_OK') send({ type: 'SUBSCRIBE', sub_id: 'canary', topic: lane.canaryNamespace });
		else if (frame.type === 'SUBSCRIBED') onResult('subscribed');
		else if (frame.type === 'ERROR') onResult(false, `gateway refused: ${String(frame.code ?? '').slice(0, 40)}`);
		else if (frame.type === 'EVENT' && frame.event?.payload?.nonce === nonce) onResult(true);
	});
	return socket;
}

/**
 * Publish through the lane and wait for the subscriber echo. Sets the lane's status to ok or
 * degraded and resolves to it. Never throws.
 */
export function runWsCanary(env, { timeoutMs = CANARY_TIMEOUT_MS, WebSocketImpl = globalThis.WebSocket, log = console.warn, overrides } = {}) {
	const lane = realtimeWsLane(env, overrides);
	if (!lane) return Promise.resolve({ status: 'off' });
	if (lane.status === 'off') return Promise.resolve(wsLaneHealth());
	const nonce = randomUUID();
	return new Promise((resolve) => {
		let socket;
		let retry = null;
		const finish = (ok, reason = '') => {
			clearTimeout(timer);
			clearTimeout(retry);
			try { socket?.close(); } catch { /* already closed */ }
			lane.status = ok ? 'ok' : 'degraded';
			lane.reason = ok ? '' : reason;
			if (!ok) log(`[osionos-bridge] realtime socket canary failed: ${reason}; publishing over HTTP`);
			resolve(wsLaneHealth());
		};
		const timer = setTimeout(() => finish(false, 'no echo within the timeout'), timeoutMs);
		timer.unref?.();
		const publishUntilSent = () => {
			if (lane.publisher.publishIfReady(lane.canaryNamespace, 'canary', { nonce })) return;
			retry = setTimeout(publishUntilSent, CANARY_RETRY_MS);
		};
		const onResult = (outcome, reason) => {
			if (outcome === 'subscribed') publishUntilSent();
			else if (outcome === true || lane.status === 'pending') finish(outcome, reason);
		};
		try {
			socket = listenForEcho(lane, secretOf(env), WebSocketImpl, nonce, onResult);
		} catch (error) {
			finish(false, `cannot open: ${String(error?.message).slice(0, 80)}`);
		}
	});
}

/** Close every lane (shutdown, tests). */
export function closeWsLanes() {
	for (const lane of lanes.values()) lane.publisher.close();
	lanes.clear();
}
