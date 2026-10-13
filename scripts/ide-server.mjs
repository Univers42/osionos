/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-server.mjs                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The IDE sandbox routes in their own process: it holds only the IDE settings, accepts only
// `osionos_ide1.` tokens (15 minutes, one workspace) and answers exactly one browser origin, so a
// compromise here never reaches the DB or service credentials of the main bridge.
// Nothing here logs a URL, a header or a token.
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { ideTokenSecret, verifyIdeToken } from './ide-token.mjs';
import { createIdeSandboxHandler, scheduleSandboxReaper } from './bridge-ide-sandbox.mjs';
import { createIdeOpsHandler, createIdePreviewHandler } from './bridge-ide-ops.mjs';
import { createIdeExecUpgradeHandler } from './bridge-ide-exec.mjs';

const DEFAULT_PORT = 4100;
const PREFLIGHT_MAX_AGE_SECONDS = '600';

function startupError(message) {
	return Object.assign(new Error(message), { status: 503 });
}

// Exact-origin rule: a value with a path or trailing slash would never equal a browser's Origin
// header, so it is refused at start-up instead of silently locking every browser out.
function parseAllowedOrigin(env) {
	const message = 'OSIONOS_IDE_ALLOWED_ORIGIN must be one http(s) origin.';
	let url;
	try { url = new URL(env.OSIONOS_IDE_ALLOWED_ORIGIN); } catch { throw startupError(message); }
	if (!['http:', 'https:'].includes(url.protocol) || env.OSIONOS_IDE_ALLOWED_ORIGIN !== url.origin) {
		throw startupError(message);
	}
	return url.origin;
}

function sendJson(response, status, body) {
	response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
	response.end(JSON.stringify(body));
}

function sendPreflight(response, allowedOrigin) {
	response.writeHead(204, {
		'access-control-allow-origin': allowedOrigin,
		'access-control-allow-methods': 'GET, POST, DELETE',
		'access-control-allow-headers': 'authorization, content-type',
		'access-control-max-age': PREFLIGHT_MAX_AGE_SECONDS,
		vary: 'Origin',
	});
	response.end();
}

async function routeIdeApi(url, request, response, ctx) {
	const origin = request.headers.origin;
	if (origin !== undefined && origin !== ctx.allowedOrigin) {
		sendJson(response, 403, { ok: false, message: 'Origin not allowed.' });
		return;
	}
	if (request.method === 'OPTIONS') {
		if (origin === ctx.allowedOrigin) sendPreflight(response, ctx.allowedOrigin);
		else sendJson(response, 404, { ok: false });
		return;
	}
	for (const handler of ctx.handlers) {
		if (await handler(url, request, response, ctx.requestConfig)) return;
	}
	sendJson(response, 404, { ok: false });
}

async function dispatch(request, response, ctx) {
	const url = new URL(request.url ?? '/', 'http://ide.local');
	if (url.pathname === '/healthz' && request.method === 'GET') {
		sendJson(response, 200, { ok: true });
		return;
	}
	if (url.pathname.startsWith('/api/ide/')) {
		await routeIdeApi(url, request, response, ctx);
		return;
	}
	sendJson(response, 404, { ok: false });
}

export function createIdeServer({ env = process.env } = {}) {
	const secret = ideTokenSecret(env);
	const allowedOrigin = parseAllowedOrigin(env);
	// The handlers pass a config as the second argument; an IDE token needs none.
	const verifySession = (token) => verifyIdeToken(token, { secret });
	const requestConfig = { allowedOrigin };
	const shared = { config: requestConfig, verifySession, env };
	const ctx = {
		allowedOrigin,
		requestConfig,
		handlers: [createIdeSandboxHandler(shared), createIdePreviewHandler(shared), createIdeOpsHandler(shared)],
	};
	const upgrade = createIdeExecUpgradeHandler({ ...shared, allowOrigin: (origin) => origin === allowedOrigin });
	const server = createServer(async (request, response) => {
		response.setHeader('x-content-type-options', 'nosniff');
		try {
			await dispatch(request, response, ctx);
		} catch (error) {
			console.warn('[osionos-ide] request failed:', error?.message);
			if (!response.headersSent) sendJson(response, 500, { ok: false, message: 'Internal error.' });
		}
	});
	server.on('upgrade', (request, socket) => {
		try { if (!upgrade(request, socket)) socket.destroy(); }
		catch { socket.destroy(); }
	});
	return server;
}

export function startIdeServer(env = process.env) {
	const server = createIdeServer({ env });
	const port = Number(env.OSIONOS_IDE_SERVER_PORT) || DEFAULT_PORT;
	server.listen(port, '0.0.0.0', () => console.info(`[osionos-ide] listening on port ${port}`));
	scheduleSandboxReaper(env);
	return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		startIdeServer();
	} catch (error) {
		process.stderr.write(`ide-server: ${error?.message}\n`);
		process.exit(1);
	}
}
