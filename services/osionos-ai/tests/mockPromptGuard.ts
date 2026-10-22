import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * The mock of the prompt guard: llama-server's OpenAI-compatible endpoint,
 * without the model.
 *
 * It answers `/v1/chat/completions` the way the guard of A1 does: two lines,
 * `Safety: …` and `Categories: …` (`spikes/a1/guard-client.py`). The reply,
 * the status and the delay are settable, so a test can make the guard answer
 * `Unsafe`, answer a 500, or hang past the timeout of the service. It records
 * every body, so a test can prove the guard received the prompt of the user
 * and nothing else.
 */

export interface MockPromptGuard {
	/** The base URL of the mock: the service calls `${baseUrl}/v1/chat/completions`. */
	baseUrl: string;
	/** The answer of the guard: the two lines of its contract. */
	reply: string;
	/** The status of the answer: 200 while the guard is up. */
	status: number;
	/** The milliseconds the mock waits before it answers. */
	delayMs: number;
	/** The JSON body of every call, in order. */
	readonly bodies: Record<string, unknown>[];
	/** The path of every call, in order. */
	readonly paths: string[];
	/** Stops the server: the port refuses the connections again. */
	stop(): Promise<void>;
	/** Starts it again on the same port. */
	start(): Promise<void>;
	/** Forgets the calls. */
	reset(): void;
	close(): Promise<void>;
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) chunks.push(Buffer.from(chunk as Buffer));
	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
	} catch {
		return {};
	}
}

/** The mock of the guard, on a random port of the loopback. */
export async function startMockPromptGuard(): Promise<MockPromptGuard> {
	const bodies: Record<string, unknown>[] = [];
	const paths: string[] = [];
	let port = 0;

	const server = createServer((request, response) => {
		void readJson(request).then((body) => {
			bodies.push(body);
			paths.push(request.url ?? '');
			const answer = (): void => {
				if (response.destroyed) return;
				if (mock.status !== 200) {
					response.writeHead(mock.status, { 'content-type': 'application/json' });
					response.end(JSON.stringify({ error: { message: 'the guard failed' } }));
					return;
				}
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ choices: [{ message: { content: mock.reply } }] }));
			};
			if (mock.delayMs > 0) {
				const timer = setTimeout(answer, mock.delayMs);
				response.on('close', () => clearTimeout(timer));
				return;
			}
			answer();
		});
	});

	const mock: MockPromptGuard = {
		baseUrl: '',
		reply: 'Safety: Safe\nCategories: None',
		status: 200,
		delayMs: 0,
		bodies,
		paths,
		async stop(): Promise<void> {
			await new Promise<void>((resolve) => {
				server.close(() => resolve());
				server.closeAllConnections?.();
			});
		},
		async start(): Promise<void> {
			await new Promise<void>((resolve) => {
				server.listen(port, '127.0.0.1', () => resolve());
			});
		},
		reset(): void {
			bodies.length = 0;
			paths.length = 0;
		},
		async close(): Promise<void> {
			await mock.stop();
		},
	};

	await new Promise<void>((resolve) => {
		server.listen(0, '127.0.0.1', () => resolve());
	});
	server.unref();
	const address = server.address();
	port = address && typeof address === 'object' ? address.port : 0;
	mock.baseUrl = `http://127.0.0.1:${port}`;
	return mock;
}
