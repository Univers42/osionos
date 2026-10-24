/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-redis-probe.test.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The capability probe of the shared store: a least-privilege ACL user may serve every
 * data command and still be refused PEXPIRE NX or GETDEL, and INFO answers NOPERM for
 * that user, so the probe asks for the commands themselves. A Redis that refuses one of
 * them is not connected, and a required store then answers 503.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import tls from 'node:tls';
import { createKv } from '../../scripts/bridge-kv.mjs';
import { bulk, integer, respServer, simple } from './fake-redis.mjs';
import { TLS_CERT, TLS_KEY } from './support/tls-cert.mjs';

const unavailable = (error) => error?.status === 503 && error?.code === 'kv_unavailable';
const quiet = { info() {}, warn() {}, error() {} };

function probeAnswer(command) {
	if (command[0] === 'SET') return { data: simple('OK') };
	if (command[0] === 'PEXPIRE') return { data: integer(1) };
	return { data: bulk('1') };
}

const isProbe = (command) => String(command[1] ?? '').startsWith('osb:probe:');

describe('the capability probe', () => {
	it('asks for SET NX, PEXPIRE NX and GETDEL before the store is used', async (t) => {
		const server = await respServer((command) => (isProbe(command) ? probeAnswer(command) : { data: bulk('ok') }), { probe: false });
		const kv = createKv({ redisUrl: server.url });
		t.after(async () => { kv.close(); await server.close(); });
		await kv.ready({ timeoutMs: 1_000 });
		assert.deepEqual(
			server.commands.filter((command) => isProbe(command)).map((command) => command[0]),
			['SET', 'PEXPIRE', 'GETDEL'],
		);
	});

	it('treats a Redis that refuses PEXPIRE NX as not connected, and the required store answers 503', async (t) => {
		const warnings = [];
		const logger = { ...quiet, warn: (message) => warnings.push(message) };
		const server = await respServer((command) => (command[0] === 'PEXPIRE' ? { data: '-ERR unknown command\r\n' } : probeAnswer(command)), { probe: false });
		const kv = createKv({ redisUrl: server.url, required: true, logger });
		t.after(async () => { kv.close(); await server.close(); });
		await assert.rejects(kv.ready({ timeoutMs: 500 }), unavailable);
		await assert.rejects(kv.get('k'), unavailable);
		assert.equal(kv.backend(), 'memory', 'the store never reached a usable Redis');
		assert.ok(warnings.some((message) => /SET NX, PEXPIRE NX, GETDEL/.test(message)), 'the refusal is named once');
	});

	it('authenticates when the URL carries a password', async (t) => {
		let authenticated = false;
		const server = await respServer((command) => {
			if (command[0] === 'AUTH') {
				authenticated = true;
				return { data: simple('OK') };
			}
			if (!authenticated) return { data: '-NOAUTH Authentication required.\r\n' };
			return isProbe(command) ? probeAnswer(command) : { data: bulk('value') };
		}, { probe: false });
		const kv = createKv({ redisUrl: server.url.replace('redis://', 'redis://:secret@'), required: true });
		t.after(async () => { kv.close(); await server.close(); });
		await kv.ready({ timeoutMs: 1_000 });
		assert.equal(await kv.get('k'), 'value');
		const auth = server.commands.find((command) => command[0] === 'AUTH');
		assert.ok(auth, 'the credentials were sent');
		assert.equal(auth.at(-1), 'secret');
	});
});

describe('the in-memory counter', () => {
	it('does not slide its window when it is incremented again', async (t) => {
		t.mock.timers.enable({ apis: ['Date'] });
		const kv = createKv({});
		assert.equal(await kv.incrWithTtl('hits', 60_000), 1);
		t.mock.timers.tick(30_000);
		assert.equal(await kv.incrWithTtl('hits', 60_000), 2);
		t.mock.timers.tick(40_000);
		assert.equal(await kv.incrWithTtl('hits', 60_000), 1, 'the window ended 60 s after the first hit, not after the last');
		kv.close();
	});
});

describe('rediss://', () => {
	it('sends the server name, so the certificate is checked against the host', async (t) => {
		const seen = [];
		const server = tls.createServer({ key: TLS_KEY, cert: TLS_CERT }, (socket) => {
			seen.push(socket.servername);
			socket.destroy();
		});
		await new Promise((done) => server.listen(0, '127.0.0.1', done));
		t.after(() => new Promise((done) => server.close(done)));
		const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
		t.after(() => {
			if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
			else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
		});
		const kv = createKv({ redisUrl: `rediss://localhost:${server.address().port}`, required: true, commandTimeoutMs: 500 });
		t.after(() => kv.close());
		await assert.rejects(kv.ready({ timeoutMs: 1_500 }), unavailable);
		assert.ok(seen.length >= 1, 'the server saw the connection');
		assert.deepEqual([...new Set(seen)], ['localhost'], 'every connection named the host');
	});
});
