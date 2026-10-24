/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-unfurl-dns.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Name resolution for the unfurler: c-ares off the libuv pool, every answer checked
 * against the blocklist, and a `lookup` hook that can only yield those validated answers.
 *
 * Caveat: with several resolv.conf servers c-ares tries each, so one lookup can take
 * longer than its timeout; the resolve deadline still bounds it.
 */

import net from 'node:net';
import { Resolver } from 'node:dns/promises';

import { hostOf, isBlockedAddress } from './bridge-unfurl-addr.mjs';
import { unfurlError } from './bridge-unfurl-errors.mjs';

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
export function defaultResolveHost(hostname) {
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
	if (addresses.some((address) => ctx.isBlocked(address))) {
		// A DNS answer that is blocked looks like a missing name to the caller:
		// 422 vs 502 would let a user enumerate internal Docker/Fly hostnames.
		throw unfurlError(net.isIP(host) ? 'blocked' : 'unreachable');
	}
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

