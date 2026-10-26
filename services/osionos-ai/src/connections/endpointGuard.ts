import { BlockList, isIPv4, isIPv6 } from 'node:net';
import { promises as dnsPromises } from 'node:dns';
import type { LookupAddress, LookupOptions } from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { config } from '../config.ts';
import { httpError } from '../http.ts';

/**
 * The guard of the endpoints a user brings (D5).
 *
 * A user may point the service at any OpenAI-compatible endpoint, so the URL
 * is the service's own door to the inside of a network. Two rules hold it
 * shut:
 *
 * - the URL itself: https only, no credentials in it, no fragment, and a
 *   literal IP address is checked right away;
 * - the resolution: the host is resolved once, and the connection is made to
 *   the address that was checked — never to a name that is resolved again
 *   later. That closes the window a rebinding attack needs.
 */

/**
 * THE BLOCKED RANGES. An address in one of them is never reached.
 *
 * IPv4: 0.0.0.0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12,
 * 192.0.0/24, 192.0.2/24, 192.88.99/24, 192.168/16, 198.18/15, 198.51.100/24,
 * 203.0.113/24, 224/4, 240/4.
 * IPv6: ::/128, ::1/128, fc00::/7, fec0::/10, fe80::/10, ff00::/8, 100::/64,
 * 2001:db8::/32 and the prefixes that carry an IPv4 address: ::/96,
 * 64:ff9b::/96, 64:ff9b:1::/48, 2001::/32, 2002::/16.
 * The IPv4-mapped range ::ffff:0:0/96 is not a range of its own: an address
 * in it is judged by the IPv4 address it carries.
 */
const BLOCKED_V4_SUBNETS: readonly (readonly [string, number])[] = [
	['0.0.0.0', 8],
	['10.0.0.0', 8],
	['100.64.0.0', 10],
	['127.0.0.0', 8],
	['169.254.0.0', 16],
	['172.16.0.0', 12],
	['192.0.0.0', 24],
	['192.0.2.0', 24], // documentation (TEST-NET-1)
	['192.88.99.0', 24], // the retired 6to4 relay anycast
	['192.168.0.0', 16],
	['198.18.0.0', 15],
	['198.51.100.0', 24], // documentation (TEST-NET-2)
	['203.0.113.0', 24], // documentation (TEST-NET-3)
	['224.0.0.0', 4],
	['240.0.0.0', 4],
];

const BLOCKED_V6_SUBNETS: readonly (readonly [string, number])[] = [
	['::', 128],
	['::1', 128],
	// The prefixes that carry an IPv4 address: each either embeds one the
	// IPv4 list above would refuse, or reaches a gateway that translates to one.
	['::', 96], // the deprecated IPv4-compatible addresses
	['64:ff9b::', 96], // NAT64, the well-known prefix
	['64:ff9b:1::', 48], // NAT64, the local-use prefix
	['2001::', 32], // Teredo, a tunnel to an IPv4 address
	['2002::', 16], // 6to4, the relay of an IPv4 address
	['2001:db8::', 32], // documentation
	['100::', 64], // the discard-only prefix
	['fc00::', 7],
	['fec0::', 10], // the deprecated site-local range, still routed on some internal nets
	['fe80::', 10],
	['ff00::', 8],
];

const blockedV4 = new BlockList();
for (const [network, prefix] of BLOCKED_V4_SUBNETS) blockedV4.addSubnet(network, prefix, 'ipv4');
const blockedV6 = new BlockList();
for (const [network, prefix] of BLOCKED_V6_SUBNETS) blockedV6.addSubnet(network, prefix, 'ipv6');

/** The timeout of a short call: the test of a connection, the list of its models. */
export const SHORT_CALL_TIMEOUT_MS = 8_000;

/** The refusal of the guard: the URL is not one we call. */
function endpointNotAllowed(): Error {
	return httpError(400, 'endpoint_not_allowed');
}

/** The host of a URL, without the brackets of an IPv6 literal. */
function hostOf(url: URL): string {
	const host = url.hostname.toLowerCase();
	return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

/** Whether the host is one of the development hosts of the escape hatch. */
function isDevHost(host: string): boolean {
	return config.devEndpointHosts.includes(host.toLowerCase());
}

/** The four bytes of an IPv4 address, or null when it is not one. */
function ipv4Bytes(address: string): Uint8Array | null {
	const parts = address.split('.');
	if (parts.length !== 4) return null;
	const bytes = new Uint8Array(4);
	for (let index = 0; index < 4; index += 1) {
		const part = parts[index];
		if (!/^\d{1,3}$/.test(part)) return null;
		const value = Number(part);
		if (value > 255) return null;
		bytes[index] = value;
	}
	return bytes;
}

/**
 * The sixteen bytes of an IPv6 address, or null when it is not one.
 *
 * It is written here because the guard has to tell an IPv4-mapped address
 * (::ffff:127.0.0.1) from a plain IPv6 one, and the standard library does
 * not say which of the two a string is.
 */
function ipv6Bytes(address: string): Uint8Array | null {
	const text = address.split('%')[0];
	// A dotted quad at the end of an IPv6 address is two groups of sixteen bits.
	const dotted = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(text);
	let source = text;
	if (dotted) {
		const bytes = ipv4Bytes(dotted[1]);
		if (!bytes) return null;
		const high = ((bytes[0] << 8) | bytes[1]).toString(16);
		const low = ((bytes[2] << 8) | bytes[3]).toString(16);
		source = `${text.slice(0, dotted.index)}${high}:${low}`;
	}
	const halves = source.split('::');
	if (halves.length > 2) return null;
	const groups: number[] = [];
	for (const half of halves) {
		if (!half) continue;
		for (const part of half.split(':')) {
			if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
			groups.push(Number.parseInt(part, 16));
		}
	}
	if (halves.length === 2) {
		const missing = 8 - groups.length;
		if (missing < 0) return null;
		groups.splice(halves[0] ? halves[0].split(':').length : 0, 0, ...new Array<number>(missing).fill(0));
	} else if (groups.length !== 8) {
		return null;
	}
	if (groups.length !== 8) return null;
	const bytes = new Uint8Array(16);
	for (let index = 0; index < 8; index += 1) {
		bytes[index * 2] = (groups[index] >> 8) & 0xff;
		bytes[index * 2 + 1] = groups[index] & 0xff;
	}
	return bytes;
}

/** Whether the sixteen bytes are an IPv4-mapped address (::ffff:0:0/96). */
function isMappedV6(bytes: Uint8Array): boolean {
	for (let index = 0; index < 10; index += 1) {
		if (bytes[index] !== 0) return false;
	}
	return bytes[10] === 0xff && bytes[11] === 0xff;
}

/**
 * Whether an address is in one of the blocked ranges.
 *
 * An IPv4-mapped IPv6 address is judged by the IPv4 address it carries: a
 * mapped 127.0.0.1 is the loopback, and a mapped 8.8.8.8 is the world.
 */
export function isBlockedAddress(address: string): boolean {
	if (isIPv4(address)) return blockedV4.check(address, 'ipv4');
	if (!isIPv6(address)) return true;
	const bytes = ipv6Bytes(address);
	if (!bytes) return true;
	if (isMappedV6(bytes)) {
		return blockedV4.check(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`, 'ipv4');
	}
	return blockedV6.check(address, 'ipv6');
}

/**
 * The check of a base URL the user brings.
 *
 * It refuses everything but https, a URL with credentials in it, a URL with a
 * fragment, and a literal address that is in a blocked range.
 *
 * The escape hatch of the development hosts lifts two rules at once: the
 * scheme may be http, and the address may be private. It never lifts them
 * apart, so an https URL to a private address stays refused.
 */
export function checkEndpointUrl(raw: string): URL {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		throw endpointNotAllowed();
	}
	if (url.username || url.password) throw endpointNotAllowed();
	if (url.hash) throw endpointNotAllowed();
	const host = hostOf(url);
	if (!host) throw endpointNotAllowed();
	const dev = isDevHost(host);
	if (url.protocol !== 'https:' && !(url.protocol === 'http:' && dev)) throw endpointNotAllowed();
	// A literal address is checked here and now: no name, no second chance.
	if (isIPv4(host) || isIPv6(host)) {
		if (isBlockedAddress(host) && !(dev && url.protocol === 'http:')) throw endpointNotAllowed();
	}
	return url;
}

/** The resolver of the guard: the addresses of a host, all of them. */
export type Resolver = (hostname: string) => Promise<LookupAddress[]>;

/** The resolver of the machine. */
const systemResolver: Resolver = async (hostname) => dnsPromises.lookup(hostname, { all: true });

/**
 * The lookup of the guard: a dns.lookup-shaped function that refuses a host
 * whose addresses include a blocked one.
 *
 * Every address is resolved first, and one blocked address refuses the
 * whole host: a name that answers with a public address and a private one is
 * refused, not half-trusted.
 */
export function guardedLookup(resolver: Resolver = systemResolver, { trustDevHosts = true } = {}) {
	return (
		hostname: string,
		options: LookupOptions,
		callback: (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
	): void => {
		resolver(hostname)
			.then((addresses) => {
				if (addresses.length === 0) {
					callback(new Error('the host has no address'), '', 4);
					return;
				}
				// A development host is trusted: its private addresses are the point.
				const trusted = trustDevHosts && isDevHost(hostname.toLowerCase());
				const refused = trusted ? undefined : addresses.find((entry) => isBlockedAddress(entry.address));
				if (refused) {
					callback(new Error('the address is not allowed'), '', 4);
					return;
				}
				if (options?.all) {
					callback(null, addresses);
					return;
				}
				const first = addresses[0];
				callback(null, first.address, first.family);
			})
			.catch((error: Error) => {
				callback(error, '', 4);
			});
	};
}

/** A fetch with the guard's rules: the shape of guardedFetch. */
export type GuardedFetch = (input: string | URL | Request, init?: RequestInit, timeoutMs?: number) => Promise<Response>;

/**
 * A fetch of the guard over its own agent and its own resolver.
 *
 * The connections use the one below, on the resolver of the machine. A caller
 * that must be proven against a hostile resolver (the MCP transport tests)
 * builds its own: the agent resolves through the guarded lookup, so the
 * address that is connected to is the address that was checked.
 *
 * The fetch never follows a redirect: a 3xx would carry the request to a host
 * the guard never saw. The caller gets the 3xx and makes of it what it must.
 *
 * The timeout is the caller's: 0 means no bound, which is what a stream of a
 * run needs; the short calls (the test of a connection, the list of its
 * models) pass eight seconds.
 *
 * `trustDevHosts: false` turns the development hatch off for this fetch: the
 * web fetcher reaches hosts the model names, never a host of ours (web C343).
 */
export function createGuardedFetch(resolver: Resolver = systemResolver, options: { trustDevHosts?: boolean } = {}): GuardedFetch {
	const agent = new Agent({ connect: { lookup: guardedLookup(resolver, options) } });
	return async (input, init, timeoutMs = 0) => {
		const timeout = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
		const signal =
			timeout && init?.signal ? AbortSignal.any([init.signal, timeout]) : (timeout ?? init?.signal);
		const options = {
			...(init ?? {}),
			...(signal ? { signal } : {}),
			dispatcher: agent,
			redirect: 'manual',
		};
		// undici's own types describe the same wire as the global ones; the cast
		// is here because the two type packages are two copies of one shape.
		const call = undiciFetch as unknown as (input: string, init: unknown) => Promise<Response>;
		const target = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
		return call(target, options);
	};
}

/** The fetch of the guard, on the resolver of the machine. */
export const guardedFetch: GuardedFetch = createGuardedFetch();

/** The fetch of a short call: the test of a connection, the list of its models. */
export async function guardedShortFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
	return guardedFetch(input, init, SHORT_CALL_TIMEOUT_MS);
}
