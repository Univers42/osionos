import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';

/**
 * A mock OpenAI-compatible upstream: the SSE of the P0a spike, with the knobs
 * the tests need (the delay before the first chunk, the number of chunks, the
 * gap between two chunks, a failure mode) and a counter of the calls.
 */

export interface MockOptions {
	/** The wait before the first chunk. */
	preDelayMs: number;
	/** The number of text chunks of one answer. */
	chunkCount: number;
	/** The wait between two chunks. */
	chunkGapMs: number;
	/** The upstream answers with an error instead of the stream. */
	fail: boolean;
}

const DEFAULT_OPTIONS: MockOptions = {
	preDelayMs: 0,
	chunkCount: 4,
	chunkGapMs: 0,
	fail: false,
};

export interface MockUpstream {
	/** The base URL of the mock: the service talks to `${baseUrl}/v1`. */
	baseUrl: string;
	/** The number of calls the upstream received. */
	readonly calls: number;
	/** The text of every answer, in the order of the calls. */
	readonly texts: string[];
	setOptions(next: Partial<MockOptions>): void;
	close(): Promise<void>;
}

/** The text of the chunks: "part-0 part-1 …". */
function chunkTexts(chunkCount: number): string[] {
	const chunks: string[] = [];
	for (let index = 0; index < chunkCount; index += 1) chunks.push(`part-${index} `);
	return chunks;
}

/** One chunk of the OpenAI-compatible stream. */
function serializeChunk(content: string, last: boolean): string {
	const payload = {
		id: 'chatcmpl-mock-0001',
		object: 'chat.completion.chunk',
		created: 0,
		model: 'mock-model',
		choices: [{ index: 0, delta: { content }, finish_reason: last ? 'stop' : null }],
		...(last ? { usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 } } : {}),
	};
	return `data: ${JSON.stringify(payload)}\n\n`;
}

/** The mock upstream, on a random port of the loopback. */
export async function startMockUpstream(initial?: Partial<MockOptions>): Promise<MockUpstream> {
	let options: MockOptions = { ...DEFAULT_OPTIONS, ...initial };
	let calls = 0;
	const texts: string[] = [];

	const server = createServer((request, response) => {
		if (!request.url?.endsWith('/chat/completions')) {
			response.writeHead(404, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ error: { message: 'not found' } }));
			return;
		}
		calls += 1;
		request.resume();
		if (options.fail) {
			response.writeHead(500, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ error: { message: 'the upstream is down' } }));
			return;
		}
		const chunks = chunkTexts(options.chunkCount);
		texts.push(chunks.join(''));
		streamAnswer(response, chunks, options);
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
		get texts(): string[] {
			return texts;
		},
		setOptions(next: Partial<MockOptions>): void {
			options = { ...options, ...next };
		},
		async close(): Promise<void> {
			await new Promise<void>((resolve) => {
				server.close(() => resolve());
				server.closeAllConnections?.();
			});
		},
	};
}

/** The stream of one answer: the chunks, one after the other. */
function streamAnswer(response: ServerResponse, chunks: string[], options: MockOptions): void {
	response.writeHead(200, {
		'content-type': 'text/event-stream',
		'cache-control': 'no-cache',
	});
	let index = 0;
	const send = () => {
		if (response.writableEnded || response.destroyed) return;
		const last = index === chunks.length - 1;
		response.write(serializeChunk(chunks[index], last));
		index += 1;
		if (last) {
			response.end('data: [DONE]\n\n');
			return;
		}
		setTimeout(send, options.chunkGapMs);
	};
	setTimeout(send, options.preDelayMs);
	response.on('close', () => {
		if (!response.writableEnded) response.destroy();
	});
}
