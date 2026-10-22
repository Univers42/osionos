/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-resp.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Minimal RESP codec for the bridge Redis client (bridge-redis.mjs only). A malformed
 * length is a protocol error, not a partial frame: the stream is desynchronised, so the
 * caller must drop the connection instead of re-parsing the same bytes forever.
 */

export class RedisProtocolError extends Error {
	constructor(message) {
		super(message);
		this.name = 'RedisProtocolError';
	}
}

function lengthOf(line, what) {
	const value = Number(line);
	if (!Number.isInteger(value) || value < -1) throw new RedisProtocolError(`malformed ${what} length`);
	return value;
}

// An integer reply is a count, not a length: every safe integer is legal, negative ones
// included (a DEL of a missing key answers 0, a command can answer -1). Only a value that
// is not an integer at all is a protocol error.
function integerOf(line) {
	if (!/^-?\d+$/.test(line)) throw new RedisProtocolError('malformed integer reply');
	const value = Number(line);
	if (!Number.isSafeInteger(value)) throw new RedisProtocolError('malformed integer reply');
	return value;
}

// Minimal RESP parser: { value, end } or null while the reply is incomplete.
export function parseReply(buffer, offset = 0) {
	if (offset >= buffer.length) return null;
	const type = buffer[offset];
	const lineEnd = buffer.indexOf('\r\n', offset);
	if (lineEnd === -1) return null;
	const line = buffer.toString('utf8', offset + 1, lineEnd);
	const next = lineEnd + 2;
	if (type === 0x2b) return { value: line, end: next };
	if (type === 0x2d) return { value: new Error(line), end: next };
	if (type === 0x3a) return { value: integerOf(line), end: next };
	if (type === 0x24) {
		const length = lengthOf(line, 'bulk');
		if (length === -1) return { value: null, end: next };
		const end = next + length + 2;
		if (end > buffer.length) return null;
		return { value: buffer.toString('utf8', next, next + length), end };
	}
	if (type === 0x2a) {
		const count = lengthOf(line, 'array');
		if (count === -1) return { value: null, end: next };
		const items = [];
		let cursor = next;
		for (let index = 0; index < count; index += 1) {
			const reply = parseReply(buffer, cursor);
			if (!reply) return null;
			items.push(reply.value);
			cursor = reply.end;
		}
		return { value: items, end: cursor };
	}
	throw new RedisProtocolError('unknown reply type');
}

export function encodeCommand(args) {
	let out = `*${args.length}\r\n`;
	for (const arg of args) {
		const value = String(arg);
		out += `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
	}
	return out;
}
