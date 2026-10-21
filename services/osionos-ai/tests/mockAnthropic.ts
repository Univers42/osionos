import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';

/**
 * A mock Anthropic upstream: the wire of Anthropic, and nothing else.
 *
 * The service speaks three wires, and this is the one of Anthropic: the
 * request is a POST on `/messages`, the key goes in the `x-api-key` header,
 * and the answer is the stream of events Anthropic sends.
 */

export interface MockAnthropic {
	/** The base URL of the mock: the service talks to `${baseUrl}/messages`. */
	baseUrl: string;
	/** The number of calls of the messages. */
	readonly calls: number;
	/** The path of every call, in the order of the calls. */
	readonly paths: string[];
	/** The `x-api-key` header of every call, in the order of the calls. */
	readonly apiKeys: string[];
	/** The body of every call, in the order of the calls. */
	readonly bodies: unknown[];
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

/** One frame of the stream of Anthropic: an event and its data. */
function frame(event: string, data: unknown): string {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** The stream of one answer, in the wire of Anthropic. */
function anthropicStream(text: string): string {
	return [
		frame('message_start', {
			type: 'message_start',
			message: {
				id: 'msg_mock',
				type: 'message',
				role: 'assistant',
				model: 'claude-mock',
				content: [],
				stop_reason: null,
				stop_sequence: null,
				usage: { input_tokens: 11, output_tokens: 1 },
			},
		}),
		frame('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
		frame('content_block_delta', {
			type: 'content_block_delta',
			index: 0,
			delta: { type: 'text_delta', text },
		}),
		frame('content_block_stop', { type: 'content_block_stop', index: 0 }),
		frame('message_delta', {
			type: 'message_delta',
			delta: { stop_reason: 'end_turn', stop_sequence: null },
			usage: { output_tokens: 7 },
		}),
		frame('message_stop', { type: 'message_stop' }),
	].join('');
}

/** The mock Anthropic upstream, on a random port of the loopback. */
export async function startMockAnthropic(): Promise<MockAnthropic> {
	let calls = 0;
	const paths: string[] = [];
	const apiKeys: string[] = [];
	const bodies: unknown[] = [];

	const server = createServer((request, response) => {
		const path = request.url ?? '';
		if (!path.endsWith('/messages')) {
			// The list of the models: what a connection is tested against.
			response.writeHead(200, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ data: [{ id: 'claude-mock' }] }));
			return;
		}
		calls += 1;
		paths.push(path);
		apiKeys.push(String(request.headers['x-api-key'] ?? ''));
		void readBody(request).then((raw) => {
			try {
				bodies.push(JSON.parse(raw));
			} catch {
				bodies.push(raw);
			}
			response.writeHead(200, {
				'content-type': 'text/event-stream',
				'cache-control': 'no-cache',
			});
			response.end(anthropicStream('hello from anthropic '));
		});
	});

	await new Promise<void>((resolve) => {
		server.listen(0, '127.0.0.1', () => resolve());
	});
	const address = server.address();
	const port = address && typeof address === 'object' ? address.port : 0;

	return {
		baseUrl: `http://127.0.0.1:${port}`,
		get calls(): number {
			return calls;
		},
		get paths(): string[] {
			return paths;
		},
		get apiKeys(): string[] {
			return apiKeys;
		},
		get bodies(): unknown[] {
			return bodies;
		},
		async close(): Promise<void> {
			await new Promise<void>((resolve) => {
				server.close(() => resolve());
				server.closeAllConnections?.();
			});
		},
	};
}
