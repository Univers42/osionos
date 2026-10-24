import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import type { AddressInfo, Server, Socket } from 'node:net';
import { after, describe, it } from 'node:test';
import { createPool } from '../src/db.ts';

/**
 * A statement whose answer never arrives.
 *
 * Release R5 (2026-10-22): the tailnet path to the live database dropped for a
 * moment, and every indexer worker sat on a query whose answer was lost, for
 * ever, with its claimed queue rows locked. statement_timeout is the SERVER's
 * bound and cannot fire for an answer the server already sent.
 *
 * The fake server below accepts the login, then swallows every query: the
 * pool must give the caller an error, not a promise that never settles.
 */

/** AuthenticationOk, then ReadyForQuery (idle): enough for pg to call the client connected. */
const LOGIN_OK = Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0, 0x5a, 0, 0, 0, 5, 0x49]);

const sockets = new Set<Socket>();
const server: Server = createServer((socket) => {
	sockets.add(socket);
	socket.once('data', () => socket.write(LOGIN_OK));
	socket.on('close', () => sockets.delete(socket));
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address() as AddressInfo;

after(async () => {
	for (const socket of sockets) socket.destroy();
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** The promise, or a refusal when it takes too long. */
function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`no answer after ${ms} ms`)), ms);
		promise.then(
			(value) => { clearTimeout(timer); resolve(value); },
			(error: unknown) => { clearTimeout(timer); reject(error); },
		);
	});
}

describe('createPool on a connection that stops answering', () => {
	it('fails the query after the read timeout instead of waiting for ever', async () => {
		const pool = createPool(`postgres://u:p@127.0.0.1:${port}/db`, 1, 300);
		try {
			await assert.rejects(withDeadline(pool.query('select 1'), 5_000), /Query read timeout/);
		} finally {
			for (const socket of sockets) socket.destroy();
			await pool.end().catch(() => undefined);
		}
	});
});
