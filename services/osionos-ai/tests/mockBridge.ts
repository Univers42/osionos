import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';

/**
 * The mock bridge: the HTTP API of the bridge, without the bridge.
 *
 * It records EVERY call — the method, the path, the body, and the
 * Authorization header — so a test can prove what did NOT go out: no DELETE,
 * no `visibility`, no token in a body.
 */

export interface BridgeCall {
	method: string;
	path: string;
	/** The body of the call, parsed. */
	body: unknown;
	/** The Authorization header of the call: the token, and where it went. */
	authorization: string;
}

export interface MockBridge {
	/** The base URL of the mock: the service talks to it directly. */
	baseUrl: string;
	/** The calls, in the order they arrived. */
	readonly calls: readonly BridgeCall[];
	/** The calls of one method. */
	ofMethod(method: string): BridgeCall[];
	/** The number of the calls. */
	readonly count: number;
	/** The status the next answers carry: 0 for the real one. */
	failWith: number;
	/** Forget the calls. */
	reset(): void;
	close(): Promise<void>;
}

/** The body of a request, read to the end. */
function readBody(request: IncomingMessage): Promise<string> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		request.on('data', (chunk: Buffer) => chunks.push(chunk));
		request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		request.on('error', () => resolve(''));
	});
}

/** The mock bridge, on a random port of the loopback. */
export async function startMockBridge(): Promise<MockBridge> {
	const calls: BridgeCall[] = [];
	const mock: MockBridge = {
		baseUrl: '',
		calls,
		ofMethod(method: string): BridgeCall[] {
			return calls.filter((call) => call.method === method);
		},
		get count(): number {
			return calls.length;
		},
		failWith: 0,
		reset(): void {
			calls.length = 0;
		},
		async close(): Promise<void> {
			await new Promise<void>((resolve) => {
				server.close(() => resolve());
				server.closeAllConnections?.();
			});
		},
	};

	const server = createServer((request, response) => {
		void readBody(request).then((raw) => {
			let body: unknown = raw;
			try {
				body = JSON.parse(raw);
			} catch {
				body = raw;
			}
			calls.push({
				method: request.method ?? '',
				path: request.url ?? '',
				body,
				authorization: String(request.headers.authorization ?? ''),
			});
			if (mock.failWith) {
				response.writeHead(mock.failWith, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ error: { message: 'refused' } }));
				return;
			}
			const path = request.url ?? '';
			if (request.method === 'POST' && path === '/api/pages') {
				const title = (body as { title?: unknown } | null)?.title;
				response.writeHead(201, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ _id: randomUUID(), title: typeof title === 'string' ? title : 'Untitled' }));
				return;
			}
			if (request.method === 'PATCH' && /^\/api\/pages\/[^/]+$/.test(path)) {
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ ok: true }));
				return;
			}
			response.writeHead(404, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ error: { message: 'not found' } }));
		});
	});

	await new Promise<void>((resolve) => {
		server.listen(0, '127.0.0.1', () => resolve());
	});
	// The listening socket does not keep the process alive: a test file that
	// never writes anything must still be able to end.
	server.unref();
	const address = server.address();
	const port = address && typeof address === 'object' ? address.port : 0;
	mock.baseUrl = `http://127.0.0.1:${port}`;
	return mock;
}
