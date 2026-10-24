/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-kv-getmany.test.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The bulk read of the shared store: one MGET for a list of keys, in the order the caller
// asked for, with the same key rules and the same fail-closed answers as the single reads.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createKv } from '../../scripts/bridge-kv.mjs';
import { respServer, bulk, storeHandler } from './fake-redis.mjs';

const unavailable = (error) => error?.status === 503 && error?.code === 'kv_unavailable';

describe('kv getMany', () => {
	it('reads the memory store in the order of the keys and answers null for a missing one', async () => {
		const kv = createKv({});
		await kv.set('a', '1', 1_000);
		await kv.set('b', '2', 1_000);
		assert.deepEqual(await kv.getMany(['a', 'b', 'c']), ['1', '2', null]);
		assert.deepEqual(await kv.getMany([]), []);
		kv.close();
	});

	it('refuses a key that is not a non-empty string', async () => {
		const kv = createKv({});
		assert.throws(() => kv.getMany('a'), TypeError);
		assert.throws(() => kv.getMany(['']), TypeError);
		kv.close();
	});

	it('sends one MGET with the prefixed keys', async (t) => {
		const server = await respServer(storeHandler());
		const kv = createKv({ redisUrl: server.url });
		t.after(async () => { kv.close(); await server.close(); });
		await kv.ready({ timeoutMs: 1_000 });
		await kv.set('a', '1', 1_000);
		await kv.set('b', '2', 1_000);
		assert.deepEqual(await kv.getMany(['a', 'b']), ['1', '2']);
		assert.deepEqual(server.commands.filter((command) => command[0] === 'MGET'), [['MGET', 'osb:a', 'osb:b']]);
	});

	it('fails closed when the redis answers an error', async (t) => {
		const server = await respServer(([name]) => (name === 'MGET' ? { data: '-READONLY\r\n' } : { data: bulk(null) }));
		const kv = createKv({ redisUrl: server.url, required: true });
		t.after(async () => { kv.close(); await server.close(); });
		await kv.ready({ timeoutMs: 1_000 });
		await assert.rejects(kv.getMany(['a']), unavailable);
	});
});
