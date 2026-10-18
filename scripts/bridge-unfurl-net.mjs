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
 * SSRF-safe outbound HTTP for every bridge feature that fetches a user-supplied
 * URL (embed resolve, chat link-preview, automation webhooks).
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
 * the resolve deadline still bounds it. Hostnames ending .local/.internal are
 * refused by name as defence in depth, which also rejects public sites that use
 * those suffixes.
 */

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { pipeline } from 'node:stream';
import zlib from 'node:zlib';
import { Resolver } from 'node:dns/promises';

import { httpError } from './bridge-social-core.mjs';

export const MAX_URL_LENGTH = 2048;
export const DEFAULT_LIMITS = Object.freeze({ deadlineMs: 10_000, requestMs: 6_000, totalBytes: 1024 * 1024, bodyBytes: 512 * 1024, redirects: 3 });
const DEFAULT_PORTS = Object.freeze(new Set([80, 443]));
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const ERRORS = Object.freeze({
	invalid: ['A valid http(s) URL is required.', 422],
	credentials: ['URLs with credentials are not allowed.', 422],
	blocked: ['This address is not allowed.', 422],
	unreachable: ['Could not fetch the link.', 502],
	redirects: ['The link redirects too many times.', 502],
	timeout: ['The link took too long to respond.', 504],
	busy: ['Too many link lookups are running. Retry shortly.', 503],
});
const DECODERS = { gzip: zlib.createGunzip, 'x-gzip': zlib.createGunzip, deflate: zlib.createInflate, br: zlib.createBrotliDecompress };
const httpAgent = new http.Agent({ keepAlive: false });
const httpsAgent = new https.Agent({ keepAlive: false });

/** Error with a fixed message per kind: upstream status and errno never reach the caller. */
export function unfurlError(kind) {
	const [message, status] = ERRORS[kind];
	return Object.assign(httpError(message, status), { unfurlKind: kind });
}

const BLOCKED_V4 = new net.BlockList();
for (const [base, prefix] of [
	['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
	['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
	['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) BLOCKED_V4.addSubnet(base, prefix, 'ipv4');
BLOCKED_V4.addAddress('255.255.255.255', 'ipv4');

function ipv6Bytes(text) {
	const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
	let body = text;
	if (dotted) {
		const [a, b, c, d] = dotted[1].split('.').map(Number);
		body = `${text.slice(0, -dotted[1].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
	}
	const [left, right] = body.split('::');
	const head = left ? left.split(':') : [];
	const tail = right ? right.split(':') : [];
	const gap = body.includes('::') ? Array(8 - head.length - tail.length).fill('0') : [];
	const bytes = new Uint8Array(16);
	[...head, ...gap, ...tail].forEach((group, index) => {
		const value = Number.parseInt(group, 16);
		bytes[index * 2] = value >> 8;
		bytes[index * 2 + 1] = value & 0xff;
	});
	return bytes;
}

// ::ffff:0:0/96 and 64:ff9b::/96 carry the v4 in the last 4 bytes; 64:ff9b:1::/48
// (RFC 8215) carries it in bytes 6-7 and 9-10 (byte 8 is the reserved u octet).
function embeddedV4(bytes) {
	const dotted = (parts) => parts.join('.');
	const zeros = (from, to) => bytes.subarray(from, to).every((byte) => byte === 0);
	if (zeros(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return dotted(bytes.subarray(12));
	if (bytes[0] === 0 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b) {
		if (zeros(4, 12)) return dotted(bytes.subarray(12));
		if (bytes[4] === 0 && bytes[5] === 1) return dotted([bytes[6], bytes[7], bytes[9], bytes[10]]);
	}
	return null;
}

function isGlobalUnicastV6(bytes) {
	if ((bytes[0] & 0xe0) !== 0x20) return false;
	const [a, b, c, d] = bytes;
	const teredo = a === 0x20 && b === 0x01 && c === 0 && d === 0;
	const documentation = (a === 0x20 && b === 0x01 && c === 0x0d && d === 0xb8) || (a === 0x3f && b === 0xff && (c & 0xf0) === 0);
	const sixToFour = a === 0x20 && b === 0x02;
	return !teredo && !documentation && !sixToFour;
}

/**
 * True when `address` must never be connected to. Fails closed: anything that is
 * not a canonical IPv4/IPv6 string is blocked.
 */
export function isBlockedAddress(address) {
	const text = String(address).replace(/^\[|\]$/g, '');
	if (net.isIPv4(text)) return BLOCKED_V4.check(text, 'ipv4');
	if (!net.isIPv6(text)) return true;
	const bytes = ipv6Bytes(text);
	const v4 = embeddedV4(bytes);
	return v4 ? BLOCKED_V4.check(v4, 'ipv4') : !isGlobalUnicastV6(bytes);
}

export function hostOf(url) {
	return url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
}

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
	if (!net.isIP(host) && /(^|\.)(localhost|local|internal)$/.test(host)) throw unfurlError('blocked');
	return url;
}

// c-ares' own timeout is not exact (a 2 s setting took 3.0 s in one container run),
// so the race below is what actually bounds a lookup; the abandoned query ends on
// its own and its rejection is swallowed by allSettled.
/** c-ares resolver (A + AAAA) off the libuv pool, bounded to `timeoutMs` per lookup. */
export function createDnsResolver({ servers, timeoutMs = 2000 } = {}) {
	const resolver = new Resolver({ timeout: timeoutMs, tries: 1 });
	if (servers) resolver.setServers(servers);
	return async function resolveHost(hostname) {
		let timer;
		const timedOut = new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs, []); });
		const answered = Promise.allSettled([resolver.resolve4(hostname), resolver.resolve6(hostname)])
			.then((answers) => answers.flatMap((answer) => (answer.status === 'fulfilled' ? answer.value : [])));
		try {
			return await Promise.race([answered, timedOut]);
		} finally {
			clearTimeout(timer);
		}
	};
}

let sharedResolveHost;
function defaultResolveHost(hostname) {
	sharedResolveHost ??= createDnsResolver();
	return sharedResolveHost(hostname);
}

function raceSignal(promise, signal) {
	if (signal.aborted) return Promise.reject(unfurlError('timeout'));
	return new Promise((resolve, reject) => {
		const onAbort = () => reject(unfurlError('timeout'));
		signal.addEventListener('abort', onAbort, { once: true });
		promise.then(resolve, () => reject(unfurlError('unreachable'))).finally(() => signal.removeEventListener('abort', onAbort));
	});
}

/** Addresses for the URL's host, refusing when none resolve or ANY is blocked. */
export async function resolveAddresses(url, ctx) {
	const host = hostOf(url);
	const addresses = net.isIP(host) ? [host] : await raceSignal(ctx.resolveHost(host), ctx.signal);
	if (addresses.length === 0) throw unfurlError('unreachable');
	if (addresses.some((address) => ctx.isBlocked(address))) throw unfurlError('blocked');
	return addresses;
}

/** `lookup` hook that only ever yields the already-validated addresses (handles Node 22's `all: true`). */
export function createPinnedLookup(addresses, isBlocked = isBlockedAddress) {
	return (_hostname, options, callback) => {
		const done = typeof options === 'function' ? options : callback;
		const wanted = typeof options === 'object' && options ? options : {};
		if (addresses.some((address) => isBlocked(address))) return done(unfurlError('blocked'));
		let entries = addresses.map((address) => ({ address, family: net.isIP(address) }));
		if (wanted.family === 4 || wanted.family === 6) entries = entries.filter((entry) => entry.family === wanted.family);
		if (entries.length === 0) return done(unfurlError('unreachable'));
		return wanted.all ? done(null, entries) : done(null, entries[0].address, entries[0].family);
	};
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
