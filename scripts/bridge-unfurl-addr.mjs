/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-unfurl-addr.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Which addresses the unfurler must never connect to. Fails closed: anything that is not
 * a canonical IPv4/IPv6 string is blocked.
 *
 * Caveat: the blocklists cover IANA special-use ranges, not the deployment's own address
 * plan. A private network that uses globally routable space (or an IPv6 range inside
 * 2000::/3) is not blocked.
 */

import net from 'node:net';

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

// ::ffff:0:0/96 and 64:ff9b::/96 carry the v4 in the last 4 bytes. 64:ff9b:1::/48
// (RFC 8215, local-use) is deliberately NOT decoded: it falls outside 2000::/3 and
// is refused whole by isGlobalUnicastV6.
function embeddedV4(bytes) {
	const dotted = (parts) => parts.join('.');
	const zeros = (from, to) => bytes.subarray(from, to).every((byte) => byte === 0);
	if (zeros(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return dotted(bytes.subarray(12));
	if (bytes[0] === 0 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b) {
		if (zeros(4, 12)) return dotted(bytes.subarray(12));
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

