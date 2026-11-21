import { BlockList, isIPv4, isIPv6 } from 'node:net';

/**
 * The address ranges no outbound call reaches, split from endpointGuard.ts
 * so config parsing can use them without importing the service config.
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
	['10.0.0.0', 8], // NOSONAR S1313: SSRF deny-list, the addresses are the point
	['100.64.0.0', 10], // NOSONAR S1313: SSRF deny-list, the addresses are the point
	['127.0.0.0', 8],
	['169.254.0.0', 16], // NOSONAR S1313: SSRF deny-list, the addresses are the point
	['172.16.0.0', 12], // NOSONAR S1313: SSRF deny-list, the addresses are the point
	['192.0.0.0', 24], // NOSONAR S1313: SSRF deny-list, the addresses are the point
	['192.0.2.0', 24], // documentation (TEST-NET-1)
	['192.88.99.0', 24], // the retired 6to4 relay anycast // NOSONAR S1313: SSRF deny-list, the addresses are the point
	['192.168.0.0', 16], // NOSONAR S1313: SSRF deny-list, the addresses are the point
	['198.18.0.0', 15], // NOSONAR S1313: SSRF deny-list, the addresses are the point
	['198.51.100.0', 24], // documentation (TEST-NET-2)
	['203.0.113.0', 24], // documentation (TEST-NET-3)
	['224.0.0.0', 4], // NOSONAR S1313: SSRF deny-list, the addresses are the point
	['240.0.0.0', 4], // NOSONAR S1313: SSRF deny-list, the addresses are the point
];

const BLOCKED_V6_SUBNETS: readonly (readonly [string, number])[] = [
	['::', 128],
	['::1', 128],
	// The prefixes that carry an IPv4 address: each either embeds one the
	// IPv4 list above would refuse, or reaches a gateway that translates to one.
	['::', 96], // the deprecated IPv4-compatible addresses
	['64:ff9b::', 96], // NAT64, the well-known prefix // NOSONAR S1313: SSRF deny-list, the addresses are the point
	['64:ff9b:1::', 48], // NAT64, the local-use prefix // NOSONAR S1313: SSRF deny-list, the addresses are the point
	['2001::', 32], // Teredo, a tunnel to an IPv4 address // NOSONAR S1313: SSRF deny-list, the addresses are the point
	['2002::', 16], // 6to4, the relay of an IPv4 address // NOSONAR S1313: SSRF deny-list, the addresses are the point
	['2001:db8::', 32], // documentation
	['100::', 64], // the discard-only prefix // NOSONAR S1313: SSRF deny-list, the addresses are the point
	['fc00::', 7], // NOSONAR S1313: SSRF deny-list, the addresses are the point
	['fec0::', 10], // the deprecated site-local range, still routed on some internal nets // NOSONAR S1313: SSRF deny-list, the addresses are the point
	['fe80::', 10], // NOSONAR S1313: SSRF deny-list, the addresses are the point
	['ff00::', 8], // NOSONAR S1313: SSRF deny-list, the addresses are the point
];

const blockedV4 = new BlockList();
for (const [network, prefix] of BLOCKED_V4_SUBNETS) blockedV4.addSubnet(network, prefix, 'ipv4');
const blockedV6 = new BlockList();
for (const [network, prefix] of BLOCKED_V6_SUBNETS) blockedV6.addSubnet(network, prefix, 'ipv6');

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
