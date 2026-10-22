/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-resp.test.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The RESP codec: a length is a length, but an integer reply is a count, and every safe
 * integer is one — a negative count is legal on the wire.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RedisProtocolError, encodeCommand, parseReply } from '../../scripts/bridge-resp.mjs';

describe('an integer reply', () => {
	for (const value of ['0', '1', '-1', '-2', '42', '9007199254740991']) {
		it(`reads ${value}`, () => {
			const reply = parseReply(Buffer.from(`:${value}\r\n`));
			assert.equal(reply.value, Number(value));
			assert.equal(reply.end, value.length + 3);
		});
	}

	for (const value of ['', 'abc', '1.5', ' ', '1e3', '9007199254740993']) {
		it(`refuses ${JSON.stringify(value)}`, () => {
			assert.throws(() => parseReply(Buffer.from(`:${value}\r\n`)), RedisProtocolError);
		});
	}
});

describe('a length', () => {
	it('refuses a bulk length below -1', () => {
		assert.throws(() => parseReply(Buffer.from('$-2\r\n')), RedisProtocolError);
	});

	it('reads the null bulk string', () => {
		assert.deepEqual(parseReply(Buffer.from('$-1\r\n')), { value: null, end: 5 });
	});

	it('refuses an array length below -1', () => {
		assert.throws(() => parseReply(Buffer.from('*-2\r\n')), RedisProtocolError);
	});
});

describe('the command encoder', () => {
	it('writes one bulk argument per command argument', () => {
		assert.equal(encodeCommand(['SET', 'osb:k', 'v']), '*3\r\n$3\r\nSET\r\n$5\r\nosb:k\r\n$1\r\nv\r\n');
	});
});
