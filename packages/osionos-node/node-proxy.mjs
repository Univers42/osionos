/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   node-proxy.mjs                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Moves one allowed request to a machine's VS Code server over its Unix socket (devil verdict
// 2026-10-30, C7e-h, A4): never a TCP hop, only allowlisted headers each way, a fixed 502 body
// that never echoes the server's error, and sockets that live only as long as the owner's lease.
import http from 'node:http';

import { nodeRequestHeaders, nodeResponseHeaders } from '../../scripts/ide-node-policy.mjs';

export const UNREACHABLE = 'The machine is not reachable.';
// Caveat: this is an idle bound on the upstream socket, not a pure connect bound; a resource
// that streams nothing for 10 s is cut too. Unix-socket connects are immediate, so in practice
// it fires only on a wedged server.
const UPSTREAM_TIMEOUT_MS = 10_000;
const UPGRADE_HEADERS = new Set(['upgrade', 'connection', 'sec-websocket-accept', 'sec-websocket-extensions', 'sec-websocket-protocol']);
// A WebSocket close frame, server to client (unmasked), status 4011 "access expired" (C7g).
const CLOSE_4011 = Buffer.from([0x88, 0x02, 0x0f, 0xab]);

export function refuseRaw(socket, status, text) {
	const reason = http.STATUS_CODES[status] ?? 'Error';
	socket.end(`HTTP/1.1 ${status} ${reason}\r\nconnection: close\r\ncontent-type: text/plain\r\ncontent-length: ${Buffer.byteLength(text)}\r\n\r\n${text}`);
}

function upstreamRequest(socketPath, method, path, headers) {
	return http.request({ socketPath, method, path, headers: { ...nodeRequestHeaders(headers), host: 'localhost' }, timeout: UPSTREAM_TIMEOUT_MS });
}

export function forwardHttp(req, res, { socketPath, upstreamPath }) {
	const upstream = upstreamRequest(socketPath, req.method, upstreamPath, req.headers);
	const fail = () => {
		if (!res.headersSent) {
			res.writeHead(502, { 'content-type': 'text/plain' });
			res.end(UNREACHABLE);
		} else res.destroy();
	};
	upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
	upstream.on('error', fail);
	upstream.on('response', (upRes) => {
		res.writeHead(upRes.statusCode, nodeResponseHeaders(upRes.headers));
		upRes.pipe(res);
	});
	req.pipe(upstream);
}

function switchingHead(headers) {
	const lines = ['HTTP/1.1 101 Switching Protocols'];
	for (const [name, value] of Object.entries(headers)) {
		if (UPGRADE_HEADERS.has(name)) lines.push(`${name}: ${value}`);
	}
	return `${lines.join('\r\n')}\r\n\r\n`;
}

// Resolves with the spliced pair once the server switched protocols, or null after answering
// the client a fixed 502 itself.
export function forwardUpgrade(req, client, head, { socketPath, upstreamPath }) {
	return new Promise((resolve) => {
		const upstream = upstreamRequest(socketPath, 'GET', upstreamPath, req.headers);
		const fail = () => { refuseRaw(client, 502, UNREACHABLE); resolve(null); };
		upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
		upstream.on('error', fail);
		upstream.on('response', (upRes) => { upRes.resume(); fail(); });
		upstream.on('upgrade', (upRes, server, serverHead) => {
			upstream.setTimeout(0);
			server.setTimeout(0);
			client.write(switchingHead(upRes.headers));
			if (serverHead.length) client.write(serverHead);
			if (head.length) server.write(head);
			server.pipe(client);
			client.pipe(server);
			const end = () => { client.destroy(); server.destroy(); };
			client.on('close', end);
			server.on('close', end);
			client.on('error', end);
			server.on('error', end);
			resolve({ client, server });
		});
		upstream.end();
	});
}

// Caveat: the close frame is written between upstream chunks; if expiry lands inside a frame the
// server is still sending, the client sees a framing error instead of 4011. The socket closes
// either way and VS Code reconnects, which then needs a fresh cookie.
export function closeExpired(pair) {
	pair.server.unpipe(pair.client);
	pair.client.end(CLOSE_4011);
	pair.server.destroy();
	setTimeout(() => pair.client.destroy(), 1000).unref();
}

// Live sockets per user, each closed at its lease's end unless the lease was extended.
export function createSocketRegistry({ maxPerUser }) {
	const byUser = new Map();
	const leases = new Map();
	const leaseKey = (userId, node) => `${userId}/${node}`;

	function arm(entry) {
		const exp = leases.get(leaseKey(entry.userId, entry.node)) ?? 0;
		const wait = exp * 1000 - Date.now();
		if (wait <= 0) return closeExpired(entry.pair);
		entry.timer = setTimeout(() => arm(entry), wait);
		entry.timer.unref();
	}

	return {
		extend(userId, node, exp) {
			const key = leaseKey(userId, node);
			leases.set(key, Math.max(leases.get(key) ?? 0, exp));
		},
		isFull: (userId) => (byUser.get(userId)?.size ?? 0) >= maxPerUser,
		reserve(userId) {
			const set = byUser.get(userId) ?? new Set();
			byUser.set(userId, set);
			const slot = { userId };
			set.add(slot);
			return slot;
		},
		attach(slot, node, pair) {
			const entry = Object.assign(slot, { node, pair, timer: null });
			arm(entry);
			pair.client.once('close', () => this.release(entry));
		},
		release(slot) {
			clearTimeout(slot.timer);
			byUser.get(slot.userId)?.delete(slot);
		},
		cut(userId) {
			for (const key of leases.keys()) if (key.startsWith(`${userId}/`)) leases.delete(key);
			for (const entry of byUser.get(userId) ?? []) {
				clearTimeout(entry.timer);
				entry.pair?.client.destroy();
				entry.pair?.server.destroy();
			}
			byUser.delete(userId);
		},
		closeAll() {
			for (const userId of [...byUser.keys()]) this.cut(userId);
		},
	};
}
