/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-node-policy.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// What the IDE origin forwards to a machine's VS Code server (devil verdict 2026-10-30, C7).
// An allowlist, measured: a full spike session (files, terminal, git, debug, completions) used
// only the extension-resource route and the WebSocket upgrade, both under the pinned commit.
// The resource route serves any readable file with its real content type, so it is narrowed
// to the extension folders; workspace files travel over the socket, never this route.
// Caveat: a feature the spike did not exercise (webviews, notebook renderers, port previews)
// may need another route; it then fails closed with a 404 until a measured addition here.
import { posix } from 'node:path';

const SOCKET_QUERY = new Set(['reconnectionToken', 'reconnection', 'skipWebSocketFrames']);
const RESOURCE_QUERY = new Set(['path', 'tkn']);
const REQUEST_HEADERS = new Set([
	'accept', 'accept-encoding', 'accept-language', 'cache-control', 'if-modified-since', 'if-none-match', 'range', 'user-agent',
	'connection', 'upgrade', 'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-extensions',
]);
// Location goes too: the resource route never redirects, and an upstream one would leave the prefix.
const DROPPED_RESPONSE = /^(set-cookie|location|access-control-.*|content-security-policy.*|x-content-type-options)$/i;
const RESOURCE_CSP = "sandbox; default-src 'none'; frame-ancestors 'none'";
const REFUSED = { status: 404 };

function onlyKeys(params, allowed) {
	const seen = new Set();
	for (const key of params.keys()) {
		if (!allowed.has(key) || seen.has(key)) return false;
		seen.add(key);
	}
	return true;
}

// The path must already be the one the server will read: absolute, normalised, no escapes a
// second decode or a Windows reading could turn into another file.
function insideRoots(path, roots) {
	if (typeof path !== 'string' || !path.startsWith('/') || /[%\\\0]/.test(path)) return false;
	if (posix.normalize(path) !== path) return false;
	return roots.some((root) => path.startsWith(`${root}/`));
}

export function classifyNodeRequest({ method, url, isUpgrade }, { basePath, commit, extensionRoots }) {
	const queryAt = url.indexOf('?');
	const pathname = queryAt === -1 ? url : url.slice(0, queryAt);
	const search = queryAt === -1 ? '' : url.slice(queryAt);
	const params = new URLSearchParams(search);
	const root = `${basePath}/stable-${commit}`;
	if (pathname === root) {
		if (!isUpgrade || method !== 'GET' || !params.get('reconnectionToken') || !onlyKeys(params, SOCKET_QUERY)) return REFUSED;
		return { kind: 'socket', upstreamPath: `/stable-${commit}${search}` };
	}
	if (pathname === `${root}/vscode-remote-resource`) {
		if (isUpgrade || (method !== 'GET' && method !== 'HEAD') || !onlyKeys(params, RESOURCE_QUERY)) return REFUSED;
		const path = params.get('path');
		if (!insideRoots(path, extensionRoots)) return REFUSED;
		return { kind: 'resource', upstreamPath: `/stable-${commit}/vscode-remote-resource?path=${encodeURIComponent(path)}` };
	}
	return REFUSED;
}

export function nodeRequestHeaders(headers) {
	const kept = {};
	for (const [name, value] of Object.entries(headers)) {
		if (REQUEST_HEADERS.has(name.toLowerCase())) kept[name.toLowerCase()] = value;
	}
	return kept;
}

export function nodeResponseHeaders(headers) {
	const kept = {};
	for (const [name, value] of Object.entries(headers)) {
		if (!DROPPED_RESPONSE.test(name)) kept[name.toLowerCase()] = value;
	}
	kept['content-security-policy'] = RESOURCE_CSP;
	kept['x-content-type-options'] = 'nosniff';
	return kept;
}

// An HTTP request needs fetch metadata saying same-origin (absent counts as not); an upgrade
// needs the exact IDE Origin, which browsers always send on a WebSocket, and its fetch metadata,
// when sent, must agree (C7a).
export function checkNodeOrigin(headers, ideOrigin, isUpgrade) {
	const site = headers['sec-fetch-site'];
	if (isUpgrade) return headers.origin === ideOrigin && (site === undefined || site === 'same-origin');
	if (site !== 'same-origin') return false;
	return headers.origin === undefined || headers.origin === ideOrigin;
}
