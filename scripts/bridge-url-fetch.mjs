/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-url-fetch.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The fetch half of the SSRF guard: one GET that can only land on an address
 * bridge-url-guard.mjs approved, with the redirects followed by hand.
 *
 * `fetch` cannot be told which address to connect to, so the request goes
 * through node:http/node:https with a custom `lookup` — the guarded one. The
 * socket therefore never sees an address the blocklist did not clear, and the
 * name is resolved where the connection is made (no resolve-then-connect gap).
 *
 * Redirects are followed here, one hop at a time: at most three, each
 * `Location` resolved against the current URL and re-validated before it is
 * fetched. A fourth hop is a 502.
 *
 * Standard library only: node:http, node:https.
 */

import http from 'node:http';
import https from 'node:https';
import { lookup as dnsLookup } from 'node:dns/promises';
import { assertPublicHttpUrl, createGuardedLookup, PRIVATE_ADDRESS_MESSAGE } from './bridge-url-guard.mjs';
import { httpError } from './bridge-social-core.mjs';

/** One GET over node:http/node:https, with the guarded lookup, a timeout and a byte cap. */
function nodeTransport(url, { lookup, headers, timeoutMs, maxBytes }) {
	return new Promise((resolvePromise, reject) => {
		const agent = url.protocol === 'https:' ? https : http;
		const request = agent.request(url, { method: 'GET', headers, lookup, signal: AbortSignal.timeout(timeoutMs) }, (response) => {
			const status = response.statusCode ?? 0;
			const responseHeaders = response.headers ?? {};
			const answer = (body) => ({ status, headers: responseHeaders, ok: status >= 200 && status < 300, body, text: () => body.toString('utf8') });
			if (status >= 300 && status < 400 && responseHeaders.location) {
				response.resume();
				resolvePromise(answer(Buffer.alloc(0)));
				return;
			}
			const chunks = [];
			let size = 0;
			let settled = false;
			const finish = () => {
				if (settled) return;
				settled = true;
				resolvePromise(answer(Buffer.concat(chunks)));
			};
			response.on('data', (chunk) => {
				const room = maxBytes - size;
				if (chunk.length >= room) {
					chunks.push(chunk.subarray(0, room));
					finish();
					response.destroy();
					return;
				}
				chunks.push(chunk);
				size += chunk.length;
			});
			response.on('end', finish);
			response.on('error', (error) => {
				if (settled) return;
				settled = true;
				reject(error);
			});
		});
		request.on('error', reject);
		request.end();
	});
}

/**
 * Fetch a public URL, following redirects by hand: at most `maxRedirects` hops,
 * each `Location` resolved against the current URL and re-validated (scheme,
 * host and blocklist — and the blocklist again at connect time through the
 * guarded lookup). More hops than that → 502.
 */
export async function fetchPublicHtml(rawUrl, {
	transport = nodeTransport,
	resolve = dnsLookup,
	headers,
	timeoutMs,
	maxBytes,
	maxRedirects = 3,
} = {}) {
	const lookup = createGuardedLookup(resolve);
	// The timeout is the budget of the whole chain, not of every hop.
	const deadline = Date.now() + (timeoutMs ?? 0);
	let current = new URL(rawUrl);
	for (let hop = 0; hop <= maxRedirects; hop += 1) {
		let response;
		try {
			response = await transport(current, {
				lookup,
				headers,
				timeoutMs: Math.max(1, deadline - Date.now()),
				maxBytes,
			});
		} catch (error) {
			if (error?.code === 'private_address') throw httpError(PRIVATE_ADDRESS_MESSAGE, 422);
			throw error;
		}
		const location = response?.headers?.location;
		if (response?.status >= 300 && response?.status < 400 && location) {
			if (hop === maxRedirects) throw httpError('Too many redirects.', 502);
			let next;
			try {
				next = new URL(location, current);
			} catch {
				throw httpError('Could not fetch the link.', 502);
			}
			if (next.protocol !== 'http:' && next.protocol !== 'https:') throw httpError('Only http(s) URLs are allowed.', 422);
			await assertPublicHttpUrl(next.toString(), { resolve });
			current = next;
			continue;
		}
		return response;
	}
	throw httpError('Too many redirects.', 502);
}
