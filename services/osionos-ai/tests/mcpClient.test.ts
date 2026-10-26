import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { FakeMcp } from './mcpFakeServer.ts';
import type { McpFailure as Failure } from '../src/mcpClient/transport.ts';

/**
 * The transport and the screening of the MCP client (E1a), against a fake MCP
 * server that can be hostile in one way at a time. Every title starts with the
 * condition of the devil's verdict it proves (e1-mcp-client-verdict.md).
 *
 * The environment is set before the imports: the service reads its
 * configuration when it is imported, and the fake server lives on 127.0.0.1,
 * which the development hosts let through over http.
 */
process.env.OSIONOS_AI_DEV_ENDPOINT_HOSTS = '127.0.0.1';

const { startFakeMcp } = await import('./mcpFakeServer.ts');
const { McpFailure, listServerTools } = await import('../src/mcpClient/transport.ts');
const { createGuardedFetch, guardedLookup } = await import('../src/connections/endpointGuard.ts');

const SECRET = 'Bearer throwaway-mcp-secret-7731';
const fakes: FakeMcp[] = [];

async function fake(initial: Parameters<typeof startFakeMcp>[0] = {}): Promise<FakeMcp> {
	const started = await startFakeMcp(initial);
	fakes.push(started);
	return started;
}

after(async () => {
	await Promise.all(fakes.map((server) => server.close()));
});

/** The code a failed listing carries, or fails the test. */
async function failureOf(work: Promise<unknown>): Promise<Failure> {
	try {
		await work;
	} catch (error) {
		assert.ok(error instanceof McpFailure, `not a fixed failure: ${String(error)}`);
		return error;
	}
	throw new assert.AssertionError({ message: 'the listing was expected to fail' });
}

describe('C263 every byte goes through the guarded fetch', () => {
	it('C263 a redirect to a second host is not followed', async () => {
		const second = await fake({ tools: [{ name: 'other' }] });
		const first = await fake({ redirectTo: second.url });
		const failure = await failureOf(listServerTools({ url: first.url }));
		assert.equal(failure.code, 'mcp_protocol');
		assert.equal(first.stats.posts, 1);
		assert.equal(second.stats.posts + second.stats.gets, 0, 'the second host must never be contacted');
	});

	it('C263 the global fetch is never called', async () => {
		const server = await fake({ tools: [{ name: 'a' }] });
		const real = globalThis.fetch;
		let calls = 0;
		globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
			calls++;
			return real(...args);
		}) as typeof fetch;
		try {
			const tools = await listServerTools({ url: server.url });
			assert.equal(tools.length, 1);
		} finally {
			globalThis.fetch = real;
		}
		assert.equal(calls, 0);
	});

	it('C263 a name that resolves to a private address is refused at connect time', async () => {
		const server = await fake({ tools: [{ name: 'a' }] });
		for (const answer of [
			[{ address: '127.0.0.1', family: 4 }],
			[{ address: '10.0.0.1', family: 4 }],
			[{ address: '::ffff:7f00:1', family: 6 }],
			// One public address does not launder a private one beside it.
			[
				{ address: '93.184.216.34', family: 4 },
				{ address: '192.168.1.9', family: 4 },
			],
		]) {
			const guarded = createGuardedFetch(async () => answer);
			const failure = await failureOf(
				listServerTools({ url: server.url.replace('127.0.0.1', 'mcp.example.test'), fetchImpl: guarded }),
			);
			assert.equal(failure.code, 'mcp_unreachable');
		}
		assert.equal(server.stats.posts, 0, 'nothing may reach the server behind the name');
	});

	it('C263 the address that was checked is the address that is used', async () => {
		let answers = 0;
		const lookup = guardedLookup(async () => {
			answers++;
			// The first answer is public, the second rebinds to the inside.
			return answers === 1 ? [{ address: '93.184.216.34', family: 4 }] : [{ address: '10.0.0.1', family: 4 }];
		});
		const outcome = (): Promise<string> =>
			new Promise((resolve) => {
				lookup('rebind.example.test', { all: true }, (error: Error | null, address: unknown) =>
					resolve(error ? 'refused' : JSON.stringify(address)),
				);
			});
		assert.match(await outcome(), /93\.184\.216\.34/);
		assert.equal(await outcome(), 'refused');
	});

	it('C263 the development hosts do nothing in production', async () => {
		const child = fileURLToPath(new URL('./mcpProdChild.ts', import.meta.url));
		const output = await new Promise<string>((resolve, reject) => {
			const process_ = spawn(process.execPath, ['--experimental-strip-types', child], {
				env: {
					...process.env,
					NODE_ENV: 'production',
					OSIONOS_AI_DEV_ENDPOINT_HOSTS: '127.0.0.1',
					OSIONOS_AI_BRIDGE_URL: 'http://bridge.invalid:4000',
				},
				stdio: ['ignore', 'pipe', 'ignore'],
			});
			let text = '';
			process_.stdout.on('data', (chunk: Buffer) => {
				text += chunk.toString('utf8');
			});
			process_.on('close', () => resolve(text));
			process_.on('error', reject);
		});
		assert.match(output, /RESULT http:\/\/127\.0\.0\.1:9\/mcp=refused https:\/\/127\.0\.0\.1\/mcp=refused https:\/\/10\.0\.0\.5\/mcp=refused/);
	});
});

describe('C267 no stream, a deadline, a cap, a closed client', () => {
	it('C267 a GET never reaches the server', async () => {
		const server = await fake({ tools: [{ name: 'a' }] });
		await listServerTools({ url: server.url });
		assert.equal(server.stats.gets, 0);
		assert.equal(server.stats.toolsListCalls, 1);
	});

	it('C267 a server that stalls is cut at the deadline and the request is abandoned', async () => {
		const server = await fake({ stall: true });
		const started = Date.now();
		const failure = await failureOf(listServerTools({ url: server.url, deadlineMs: 400 }));
		assert.equal(failure.code, 'mcp_timeout');
		assert.ok(Date.now() - started < 3000, 'the deadline must bound the whole call');
		await new Promise((resolve) => setTimeout(resolve, 200));
		assert.equal(server.stats.aborted, 1, 'the client must close the socket of the stalled request');
	});

	it('C267 an event stream that never ends is cut at the deadline', async () => {
		const server = await fake({ streamForever: true });
		const failure = await failureOf(listServerTools({ url: server.url, deadlineMs: 500, maxBodyBytes: 1 << 30 }));
		assert.equal(failure.code, 'mcp_timeout');
	});

	it('C267 an event stream is cut at the body cap while it streams', async () => {
		const server = await fake({ streamForever: true });
		const failure = await failureOf(listServerTools({ url: server.url, deadlineMs: 10_000, maxBodyBytes: 65_536 }));
		assert.equal(failure.code, 'mcp_too_large');
	});

	it('C267 a 2 MiB body is refused as too large', async () => {
		const server = await fake({ bodyBytes: 2 * 1024 * 1024 });
		const failure = await failureOf(listServerTools({ url: server.url }));
		assert.equal(failure.code, 'mcp_too_large');
	});
});

describe('C275 the words of the server never come back', () => {
	it('C275 an error body that echoes the header is not in the failure, the stack or the output', async () => {
		const server = await fake({ echoAuthorization: true });
		const written: string[] = [];
		const out = process.stdout.write.bind(process.stdout);
		const err = process.stderr.write.bind(process.stderr);
		// Forwarded, not swallowed: the runner reports through these streams, and
		// a spy that eats them drops the results of the tests that finish meanwhile.
		process.stdout.write = ((chunk: string | Uint8Array) => (written.push(String(chunk)), out(chunk))) as typeof process.stdout.write;
		process.stderr.write = ((chunk: string | Uint8Array) => (written.push(String(chunk)), err(chunk))) as typeof process.stderr.write;
		let failure: Failure;
		try {
			failure = await failureOf(listServerTools({ url: server.url, header: { name: 'Authorization', value: SECRET } }));
		} finally {
			process.stdout.write = out;
			process.stderr.write = err;
		}
		assert.equal(server.stats.authorization[0], SECRET, 'the server did receive the header');
		assert.equal(failure.code, 'mcp_protocol');
		const everything = [failure.message, failure.stack ?? '', JSON.stringify(failure), ...written].join('\n');
		assert.ok(!everything.includes(SECRET), 'the secret leaked');
		assert.ok(!everything.includes('upstream exploded'), 'the body of the server leaked');
	});
});
