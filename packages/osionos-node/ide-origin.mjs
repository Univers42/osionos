/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-origin.mjs                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The IDE origin (ADR-006 decision 6, devil verdict 2026-10-30 C6-C10, A6): a non-public origin,
// run by the owner's own osionos-node, that the app frames. It trades a node-scoped IDE token for
// an HttpOnly cookie, then lets only the measured VS Code routes through to the owner's machines.
// Milestone 1 is owner-only: every subject but `ownerId` is refused.
import http from 'node:http';

import { checkNodeOrigin, classifyNodeRequest } from '../../scripts/ide-node-policy.mjs';
import { isNodeId, signNodeCap, verifyIdeToken, verifyNodeCap } from '../../scripts/ide-token.mjs';
import { createSocketRegistry, forwardHttp, forwardUpgrade, refuseRaw } from './node-proxy.mjs';

const PREFIX = '/api/node/';
const COOKIE_PREFIX = '__Host-osio-node-';
const MAX_SESSION_BODY = 1024;
const TEXT = { 401: 'Machine access is invalid.', 403: 'Forbidden.', 404: 'Not found.', 405: 'Method not allowed.', 429: 'Too many machine connections.' };

const fail = (status) => Object.assign(new Error(TEXT[status]), { status });

function reply(res, status, text = TEXT[status]) {
	res.writeHead(status, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
	res.end(text);
}

function readCookie(header, name) {
	for (const part of String(header ?? '').split(';')) {
		const at = part.indexOf('=');
		if (at !== -1 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
	}
	return null;
}

function readSmallJson(req) {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];
		req.on('data', (chunk) => {
			size += chunk.length;
			if (size > MAX_SESSION_BODY) { reject(fail(403)); req.destroy(); } else chunks.push(chunk);
		});
		req.on('end', () => {
			try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(fail(403)); }
		});
		req.on('error', reject);
	});
}

// `/api/node/<id>/rest` → { id, rest }; anything else is not a node route.
function splitNodePath(url) {
	if (!url.startsWith(PREFIX)) return null;
	const slash = url.indexOf('/', PREFIX.length);
	if (slash === -1) return null;
	const id = url.slice(PREFIX.length, slash);
	return isNodeId(id) ? { id } : { id: null };
}

export function createIdeOriginServer({ secret, ownerId, ideOrigin, commit, nodes, maxSocketsPerUser = 8, client = null }) {
	const sockets = createSocketRegistry({ maxPerUser: maxSocketsPerUser });
	const revokedAt = new Map();
	const isRevoked = (userId, iat) => iat <= (revokedAt.get(userId) ?? -1);

	async function openSession(req, res) {
		if (req.method !== 'POST') throw fail(405);
		if (!checkNodeOrigin(req.headers, ideOrigin, false) || req.headers.origin !== ideOrigin) throw fail(403);
		const bearer = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];
		let token;
		try { token = verifyIdeToken(bearer, { secret }); } catch { throw fail(401); }
		if (token.scope !== 'node' || token.userId !== ownerId) throw fail(403);
		if (isRevoked(token.userId, token.iat)) throw fail(401);
		const { node } = await readSmallJson(req);
		if (!isNodeId(node) || !Object.hasOwn(nodes, node)) throw fail(404);
		const { cap, exp } = signNodeCap({ userId: token.userId, node, secret, parentExp: token.exp });
		sockets.extend(token.userId, node, exp);
		const maxAge = exp - Math.floor(Date.now() / 1000);
		res.writeHead(204, {
			'set-cookie': `${COOKIE_PREFIX}${node}=${cap}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`,
			'cache-control': 'no-store',
		});
		res.end();
	}

	// Order matters for C6: an unknown node and a known one without its cookie both answer 401,
	// so an unauthenticated caller cannot list the owner's machines.
	function authorize(req, isUpgrade) {
		if (!checkNodeOrigin(req.headers, ideOrigin, isUpgrade)) throw fail(403);
		const route = splitNodePath(req.url);
		if (!route?.id) throw fail(404);
		const value = readCookie(req.headers.cookie, `${COOKIE_PREFIX}${route.id}`);
		let cap;
		try { cap = verifyNodeCap(value, { secret }); } catch { throw fail(401); }
		if (cap.node !== route.id || isRevoked(cap.userId, cap.iat)) throw fail(401);
		if (cap.userId !== ownerId) throw fail(403);
		// C7c: the id is only ever a registry key.
		if (!Object.hasOwn(nodes, route.id)) throw fail(404);
		const machine = nodes[route.id];
		const verdict = classifyNodeRequest({ method: req.method, url: req.url, isUpgrade }, {
			basePath: `${PREFIX}${route.id}`, commit, extensionRoots: machine.extensionRoots,
		});
		if (!verdict.kind) throw fail(404);
		return { cap, machine, verdict };
	}

	async function onRequest(req, res) {
		try {
			if (req.url === `${PREFIX}session`) return await openSession(req, res);
			if (!req.url.startsWith(PREFIX)) return client ? client(req, res) : reply(res, 404);
			const { machine, verdict } = authorize(req, false);
			forwardHttp(req, res, { socketPath: machine.socketPath, upstreamPath: verdict.upstreamPath });
		} catch (error) {
			if (!res.headersSent) reply(res, error.status ?? 500, TEXT[error.status] ?? 'Internal error.');
		}
	}

	async function onUpgrade(req, socket, head) {
		socket.on('error', () => socket.destroy());
		let grant;
		try {
			grant = authorize(req, true);
		} catch (error) {
			return refuseRaw(socket, error.status ?? 500, TEXT[error.status] ?? 'Internal error.');
		}
		const { cap, machine, verdict } = grant;
		if (sockets.isFull(cap.userId)) return refuseRaw(socket, 429, TEXT[429]);
		const slot = sockets.reserve(cap.userId);
		sockets.extend(cap.userId, cap.node, cap.exp);
		const pair = await forwardUpgrade(req, socket, head, { socketPath: machine.socketPath, upstreamPath: verdict.upstreamPath });
		if (!pair) return sockets.release(slot);
		sockets.attach(slot, cap.node, pair);
	}

	const server = http.createServer(onRequest);
	server.on('upgrade', onUpgrade);
	return {
		server,
		// Cuts every open socket of a user at once and voids every credential issued until now.
		revoke(userId) {
			revokedAt.set(userId, Math.floor(Date.now() / 1000));
			sockets.cut(userId);
		},
		close() {
			sockets.closeAll();
			server.closeAllConnections?.();
			server.close();
		},
	};
}
