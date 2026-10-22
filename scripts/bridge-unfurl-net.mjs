/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-unfurl-net.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * SSRF-safe outbound HTTP for the embed resolver. The chat link preview and the
 * automation webhook use bridge-url-guard + bridge-url-fetch; what that guard
 * refuses is refused here too (bridge-unfurl-addr.mjs).
 *
 * Order of defence, each step independent of the next:
 *   1. parseTargetUrl: scheme, userinfo, length, port allowlist (80/443).
 *   2. resolveAddresses: IP literals are classified BEFORE connecting (Node skips
 *      the `lookup` hook for literals, so a hook alone cannot catch http://127.1/);
 *      names resolve through c-ares (not getaddrinfo, which would share the
 *      4-thread libuv pool with every other bridge fetch). ANY blocked address
 *      refuses the host.
 *   3. createPinnedLookup: the socket connects only to the addresses validated in
 *      step 2, so a second DNS answer cannot rebind the connection. Host header
 *      and TLS SNI stay the hostname; TLS verification is the Node default.
 *   4. Redirects are manual and every hop re-runs 1-3.
 *   5. Budgets: one wall-clock deadline per resolve, a per-request cap, and a
 *      byte cap counted on DECODED output.
 *
 * Caveat: the IPv4/IPv6 blocklists cover IANA special-use ranges, not the
 * deployment's own address plan. A private network that uses globally routable
 * space (or an IPv6 range inside 2000::/3) is not blocked. With several
 * resolv.conf servers c-ares tries each, so DNS can take longer than its timeout;
 * the resolve deadline still bounds it. Hostnames ending .local/.internal/.flycast are
 * refused by name as defence in depth, which also rejects public sites that use
 * those suffixes.
 */

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { pipeline } from 'node:stream';
import zlib from 'node:zlib';

import { hostOf, isBlockedAddress } from './bridge-unfurl-addr.mjs';
import { createDnsResolver, createPinnedLookup, defaultResolveHost, resolveAddresses } from './bridge-unfurl-dns.mjs';
import { unfurlError } from './bridge-unfurl-errors.mjs';

// The pieces that moved out stay importable from here: this is the one door callers use.
export { hostOf, isBlockedAddress, createDnsResolver, createPinnedLookup, resolveAddresses, unfurlError };

export const MAX_URL_LENGTH = 2048;
export const DEFAULT_LIMITS = Object.freeze({ deadlineMs: 10_000, requestMs: 6_000, totalBytes: 1024 * 1024, bodyBytes: 512 * 1024, redirects: 3 });
const DEFAULT_PORTS = Object.freeze(new Set([80, 443]));
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const DECODERS = { gzip: zlib.createGunzip, 'x-gzip': zlib.createGunzip, deflate: zlib.createInflate, br: zlib.createBrotliDecompress };
const httpAgent = new http.Agent({ keepAlive: false });
const httpsAgent = new https.Agent({ keepAlive: false });

/** Validate scheme, userinfo, length and port; returns the normalised URL. */
export function parseTargetUrl(raw, allowedPorts = DEFAULT_PORTS) {
	if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH) throw unfurlError('invalid');
	let url;
	try { url = new URL(raw.trim()); } catch { throw unfurlError('invalid'); }
	if (url.protocol !== 'http:' && url.protocol !== 'https:') throw unfurlError('invalid');
	if (url.username || url.password) throw unfurlError('credentials');
	if (url.href.length > MAX_URL_LENGTH) throw unfurlError('invalid');
	if (!allowedPorts.has(Number(url.port) || (url.protocol === 'https:' ? 443 : 80))) throw unfurlError('blocked');
	const host = hostOf(url);
	if (!net.isIP(host) && /(^|\.)(localhost|local|internal|flycast)$/.test(host)) throw unfurlError('blocked');
	return url;
}

/** Per-resolve budget: wall-clock deadline, shared decoded-byte allowance, injectable seams for tests. */
export function createFetchContext(options = {}) {
	const limits = { ...DEFAULT_LIMITS, ...options.limits };
	return {
		limits,
		signal: AbortSignal.timeout(limits.deadlineMs),
		bytes: { left: limits.totalBytes },
		resolveHost: options.resolveHost ?? defaultResolveHost,
		isBlocked: options.isBlocked ?? isBlockedAddress,
		allowedPorts: options.allowedPorts ?? DEFAULT_PORTS,
		transports: options.transports ?? { http, https },
	};
}

function requestOnce(url, addresses, { method, headers, body }, ctx) {
	const secure = url.protocol === 'https:';
	const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(ctx.limits.requestMs)]);
	return new Promise((resolve, reject) => {
		const request = ctx.transports[secure ? 'https' : 'http'].request({
			hostname: hostOf(url),
			port: Number(url.port) || (secure ? 443 : 80),
			path: `${url.pathname}${url.search}`,
			method,
			headers,
			agent: secure ? httpsAgent : httpAgent,
			lookup: createPinnedLookup(addresses, ctx.isBlocked),
			maxHeaderSize: 16 * 1024,
			signal,
		}, (response) => resolve({ response, signal }));
		request.once('error', () => reject(unfurlError(signal.aborted ? 'timeout' : 'unreachable')));
		request.end(body);
	});
}

// Counts DECODED bytes and destroys the stream at the cap, so a gzip bomb costs
// at most one decoder chunk beyond it. Unknown encodings are not parsed.
async function readCapped(response, signal, ctx, cap) {
	const encoding = String(response.headers['content-encoding'] || 'identity').trim().toLowerCase();
	const makeDecoder = DECODERS[encoding];
	if (encoding !== 'identity' && !makeDecoder) { response.destroy(); return null; }
	const decoder = makeDecoder?.();
	const source = decoder ? pipeline(response, decoder, () => {}) : response;
	const chunks = [];
	let size = 0;
	try {
		for await (const chunk of source) {
			const take = Math.min(chunk.length, cap - size, ctx.bytes.left);
			chunks.push(take === chunk.length ? chunk : chunk.subarray(0, take));
			size += take;
			ctx.bytes.left -= take;
			if (size >= cap || ctx.bytes.left <= 0) break;
		}
	} catch {
		if (signal.aborted) throw unfurlError('timeout');
	} finally {
		response.destroy();
		decoder?.destroy();
	}
	return Buffer.concat(chunks);
}

/**
 * Guarded fetch. Redirects are followed only when `redirects > 0` (GET); each hop
 * is fully re-validated. The body is read only when `wantBody(status, headers)`.
 * Resolves `{ url, status, headers, body }` where `url` is the final URL.
 */
export async function safeFetch(rawUrl, options, ctx) {
	const { method = 'GET', headers = {}, body, wantBody = () => false } = options;
	const redirects = options.redirects ?? ctx.limits.redirects;
	const sendHeaders = { 'user-agent': 'osionos-link-preview/1.0', ...headers, 'accept-encoding': 'identity' };
	let url = parseTargetUrl(rawUrl, ctx.allowedPorts);
	for (let hop = 0; ; hop += 1) {
		const addresses = await resolveAddresses(url, ctx);
		const { response, signal } = await requestOnce(url, addresses, { method, headers: sendHeaders, body }, ctx);
		const location = redirects > 0 && REDIRECT_STATUS.has(response.statusCode) ? response.headers.location : undefined;
		if (!location) {
			const { statusCode: status, headers: responseHeaders } = response;
			const bytes = wantBody(status, responseHeaders) ? await readCapped(response, signal, ctx, ctx.limits.bodyBytes) : (response.destroy(), null);
			return { url, status, headers: responseHeaders, body: bytes };
		}
		response.destroy();
		if (hop >= redirects) throw unfurlError('redirects');
		let next;
		try { next = new URL(location, url).href; } catch { throw unfurlError('invalid'); }
		url = parseTargetUrl(next, ctx.allowedPorts);
	}
}
