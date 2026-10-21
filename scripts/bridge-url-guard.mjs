/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-url-guard.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * SSRF guard: which addresses the bridge may connect to, and how the check
 * reaches the socket.
 *
 * The 2026-10-21 risk review found three holes in the old check-then-fetch of
 * the chat link preview: redirects were followed unchecked, half the private
 * ranges were missing and the name was resolved twice (once to validate, once
 * to connect) — so a name answering public first and private second walked
 * straight in. Here:
 *
 *   1. one blocklist (node:net BlockList) holds every network the bridge must
 *      never reach: RFC1918, loopback, "this host", CGNAT (100.64.0.0/10 —
 *      the Tailscale range the BaaS VM answers on), the IETF/benchmark/
 *      documentation blocks, multicast and the reserved tail;
 *   2. the check happens where the socket is made: `createGuardedLookup`
 *      resolves the host, drops every blocked answer and hands back only the
 *      allowed IPs, so the socket can only ever connect to an address the
 *      guard has seen (no rebinding);
 *   3. `assertPublicHttpUrl` still refuses a bad URL up front, so the caller
 *      gets a readable 422 instead of a socket error.
 *
 * Standard library only: node:net, node:dns.
 */

import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { httpError } from './bridge-social-core.mjs';

export const PRIVATE_ADDRESS_MESSAGE = 'Host resolves to a private address.';

/** IPv4 networks that must never be reached (see the header for the why). */
const BLOCKED_V4 = [
	['0.0.0.0', 8], // "this host" / current network
	['10.0.0.0', 8], // RFC1918
	['100.64.0.0', 10], // CGNAT — the Tailscale range the BaaS VM lives on
	['127.0.0.0', 8], // loopback
	['169.254.0.0', 16], // link-local (cloud metadata lives here)
	['172.16.0.0', 12], // RFC1918
	['192.0.0.0', 24], // IETF protocol assignments
	['192.0.2.0', 24], // TEST-NET-1
	['192.168.0.0', 16], // RFC1918
	['198.18.0.0', 15], // benchmarking
	['198.51.100.0', 24], // TEST-NET-2
	['203.0.113.0', 24], // TEST-NET-3
	['224.0.0.0', 4], // multicast
	['240.0.0.0', 4], // reserved (covers the broadcast address)
];

/** IPv6 networks that must never be reached. */
const BLOCKED_V6 = [
	['::', 128], // unspecified
	['::1', 128], // loopback
	// ::ffff:0:0/96 (IPv4-mapped) is deliberately NOT a rule: node's BlockList
	// folds every IPv4 address into that range and would then refuse the whole
	// internet. The mapped forms are covered by the normalisation below, which
	// folds them onto the IPv4 address they carry.
	['64:ff9b::', 96], // NAT64
	['64:ff9b:1::', 48], // NAT64, local use
	['100::', 64], // discard-only
	['2001:db8::', 32], // documentation
	['fc00::', 7], // unique local
	['fe80::', 10], // link-local
	['fec0::', 10], // site-local (deprecated)
	['ff00::', 8], // multicast
];

const BLOCKED = new BlockList();
for (const [network, prefix] of BLOCKED_V4) BLOCKED.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of BLOCKED_V6) BLOCKED.addSubnet(network, prefix, 'ipv6');
BLOCKED.addAddress('255.255.255.255', 'ipv4');

/** Expand an IPv6 literal into its eight 16-bit groups (null when malformed). */
function ipv6Groups(ip) {
	const halves = ip.split('::');
	if (halves.length > 2) return null;
	const parse = (chunk) => {
		if (!chunk) return [];
		const groups = [];
		for (const piece of chunk.split(':')) {
			if (piece.includes('.')) {
				const bytes = piece.split('.').map(Number);
				if (bytes.length !== 4 || bytes.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
				groups.push((bytes[0] << 8) | bytes[1], (bytes[2] << 8) | bytes[3]);
				continue;
			}
			if (!/^[0-9a-f]{1,4}$/.test(piece)) return null;
			groups.push(Number.parseInt(piece, 16));
		}
		return groups;
	};
	const head = parse(halves[0]);
	const tail = halves.length === 2 ? parse(halves[1]) : [];
	if (!head || !tail) return null;
	if (halves.length === 1) return head.length === 8 ? head : null;
	const fill = 8 - head.length - tail.length;
	return fill < 1 ? null : [...head, ...Array(fill).fill(0), ...tail];
}

/**
 * Normalise an address for the blocklist: brackets and zone ids off, and an
 * IPv4-mapped IPv6 (`::ffff:a00:5`, `::ffff:10.0.0.5`) folded onto the IPv4
 * address it carries, so one set of rules covers both spellings.
 */
export function normalizeAddress(ip) {
	const bare = String(ip ?? '').trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '').split('%')[0];
	if (isIP(bare) === 4) return { address: bare, family: 4 };
	const groups = ipv6Groups(bare);
	if (!groups) return { address: bare, family: 0 };
	if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
		const [high, low] = [groups[6], groups[7]];
		return { address: [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.'), family: 4 };
	}
	return { address: bare, family: 6 };
}

/** True when the address must never be connected to (unknown shapes fail closed). */
export function isBlockedAddress(ip) {
	const { address, family } = normalizeAddress(ip);
	if (family === 4) return BLOCKED.check(address, 'ipv4');
	if (family === 6) return BLOCKED.check(address, 'ipv6');
	return true;
}

/** The error raised when a host resolves onto a blocked address. */
export function privateAddressError() {
	return Object.assign(new Error(PRIVATE_ADDRESS_MESSAGE), { code: 'private_address', status: 422 });
}

/** Resolve a host to its addresses (an IP literal resolves to itself). */
export async function resolveAddresses(hostname, resolve) {
	const bare = String(hostname ?? '').replace(/^\[/, '').replace(/\]$/, '');
	const literal = isIP(bare);
	if (literal) return [{ address: bare, family: literal }];
	const entries = await resolve(bare, { all: true });
	return (Array.isArray(entries) ? entries : []).map((entry) => ({
		address: entry.address,
		family: entry.family || isIP(entry.address) || 4,
	}));
}

/**
 * A `dns.lookup` replacement for node:http/node:https: it resolves the host,
 * drops every blocked answer and hands back only the allowed addresses, so the
 * socket can never connect to an IP the guard has not seen (no rebinding).
 */
export function createGuardedLookup(resolve = dnsLookup) {
	return (hostname, options, callback) => {
		const done = typeof options === 'function' ? options : callback;
		const wantsAll = typeof options === 'function' ? false : Boolean(options?.all);
		resolveAddresses(hostname, resolve).then((entries) => {
			const allowed = entries.filter((entry) => !isBlockedAddress(entry.address));
			if (allowed.length === 0) {
				done(privateAddressError());
				return;
			}
			if (wantsAll) done(null, allowed);
			else done(null, allowed[0].address, allowed[0].family);
		}, (error) => done(error));
	};
}

/**
 * Reject loopback/private/link-local hosts (SSRF guard) before a server fetch.
 * `resolve` is injectable so the tests can answer with a scripted resolver.
 */
export async function assertPublicHttpUrl(rawUrl, { resolve = dnsLookup } = {}) {
	let parsed;
	try {
		parsed = new URL(rawUrl);
	} catch {
		throw httpError('A valid http(s) URL is required.', 422);
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw httpError('Only http(s) URLs are allowed.', 422);
	const host = parsed.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
	if (host === 'localhost' || host.endsWith('.internal') || host.endsWith('.local')) throw httpError('Host is not allowed.', 422);
	let candidates;
	if (isIP(host)) {
		candidates = [host];
	} else {
		const entries = await resolve(host, { all: true }).catch(() => []);
		candidates = (Array.isArray(entries) ? entries : []).map((entry) => entry.address);
	}
	if (candidates.length === 0) throw httpError('Host could not be resolved.', 422);
	for (const ip of candidates) {
		if (isBlockedAddress(ip)) throw httpError(PRIVATE_ADDRESS_MESSAGE, 422);
	}
	return parsed;
}
