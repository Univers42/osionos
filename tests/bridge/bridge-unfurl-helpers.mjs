/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-unfurl-helpers.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Shared fixtures for the bridge-unfurl-*.test.mjs files (not itself a test:
// the runner globs *.test.mjs).

import http from 'node:http';
import https from 'node:https';

import { isBlockedAddress } from '../../scripts/bridge-unfurl-net.mjs';

/** Loopback test server on an ephemeral port that counts TCP connections and requests. */
export async function startServer(handler) {
	const seen = { connections: 0, requests: [] };
	const server = http.createServer((request, response) => {
		seen.requests.push({ url: request.url, headers: request.headers, method: request.method });
		handler(request, response, seen);
	});
	server.on('connection', () => { seen.connections += 1; });
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address();
	return { server, seen, port, close: () => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); } };
}

/**
 * Net options that let the guard reach the loopback test servers while every
 * other address keeps the REAL classification. `names` maps a fake hostname to
 * the addresses a DNS answer would carry; `attempts` records every outbound
 * request the guard let through, by hostname.
 */
export function loopbackNet({ ports, names = {}, limits } = {}) {
	const attempts = [];
	const spy = (module) => ({
		request: (options, callback) => {
			attempts.push(options.hostname);
			return module.request(options, callback);
		},
	});
	return {
		attempts,
		options: {
			allowedPorts: new Set(ports),
			isBlocked: (address) => (address === '127.0.0.1' ? false : isBlockedAddress(address)),
			resolveHost: async (hostname) => names[hostname] ?? [],
			transports: { http: spy(http), https: spy(https) },
			limits,
		},
	};
}

export function html(body, head = '') {
	return `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;
}

export function sendHtml(response, text, headers = {}) {
	response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...headers });
	response.end(text);
}
