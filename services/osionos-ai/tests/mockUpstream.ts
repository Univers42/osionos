import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

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
	/** The models the list of /models answers with. */
	models: string[];
	/** The status of the answer of /models: 200, or a 3xx to redirect. */
	modelsStatus: number;
	/** The key the exchange of a sign-in answers with. */
	authKey: string;
	/** The exchange of a sign-in fails. */
	authFail: boolean;
	/**
	 * The upstream never reports the usage, even when the request asks for it.
	 * This is the server that does not know `stream_options.include_usage`.
	 */
	neverSendUsage: boolean;
	/**
	 * The tool the next answer calls: the name of the tool, and the
	 * arguments of the call.
	 *
	 * The call is answered once: the answer after it is the text, so the loop
	 * of the model ends.
	 */
	toolCall: { name: string; arguments: Record<string, unknown> } | null;
}

const DEFAULT_OPTIONS: MockOptions = {
	preDelayMs: 0,
	chunkCount: 4,
	chunkGapMs: 0,
	fail: false,
	models: ['mock-model', 'mock-small'],
	modelsStatus: 200,
	authKey: 'sk-openrouter-mock-0123456789',
	authFail: false,
	neverSendUsage: false,
	toolCall: null,
};

export interface MockUpstream {
	/** The base URL of the mock: the service talks to `${baseUrl}/v1`. */
	baseUrl: string;
	/** The number of calls the upstream received. */
	readonly calls: number;
	/** The text of every answer, in the order of the calls. */
	readonly texts: string[];
	/** The body of every request, in the order of the calls. */
	readonly bodies: unknown[];
	/** The number of streams the client cut before the end. */
	readonly aborted: number;
	/** The Authorization header of every request, in the order of the calls. */
	readonly authorizations: string[];
	/** The number of calls of the list of the models. */
	readonly modelsCalls: number;
	/** The number of calls of the exchange of a sign-in. */
	readonly authCalls: number;
	/** The body of every exchange of a sign-in, in the order of the calls. */
	readonly authBodies: unknown[];
	/** The key the exchange of a sign-in answers with. */
	readonly authKey: string;
	/** The body of the last request: the prompt the service sent. */
	lastBody(): unknown;
	/** The Authorization header of the last request. */
	lastAuthorization(): string;
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
function serializeChunk(content: string, last: boolean, sendUsage: boolean): string {
	const payload = {
		id: 'chatcmpl-mock-0001',
		object: 'chat.completion.chunk',
		created: 0,
		model: 'mock-model',
		choices: [{ index: 0, delta: { content }, finish_reason: last ? 'stop' : null }],
		...(last && sendUsage ? { usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 } } : {}),
	};
	return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * One chunk of a tool call: the name of the tool and its arguments.
 *
 * The wire is the OpenAI one: the arguments travel as a string, and the
 * provider parses them when the call is complete.
 */
function serializeToolCallChunk(
	id: string,
	name: string,
	args: string,
	last: boolean,
	sendUsage: boolean,
): string {
	const payload = {
		id: 'chatcmpl-mock-0001',
		object: 'chat.completion.chunk',
		created: 0,
		model: 'mock-model',
		choices: [
			{
				index: 0,
				delta: last
					? {}
					: { tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: args } }] },
				finish_reason: last ? 'tool_calls' : null,
			},
		],
		...(last && sendUsage ? { usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 } } : {}),
	};
	return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Whether the request asks for the usage: `stream_options.include_usage`.
 *
 * A real upstream reports the tokens of a stream only when it is asked to, and
 * the mock does the same: a test that forgets the option sees no usage.
 */
export function askedForUsage(body: unknown): boolean {
	const options = (body as { stream_options?: { include_usage?: unknown } } | null)?.stream_options;
	return options?.include_usage === true;
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

/** The mock upstream, on a random port of the loopback. */
export async function startMockUpstream(initial?: Partial<MockOptions>): Promise<MockUpstream> {
	let options: MockOptions = { ...DEFAULT_OPTIONS, ...initial };
	// The tool call that is waiting for its answer: it is asked for once, and
	// the answer after it is the text.
	let pendingToolCall: MockOptions['toolCall'] = null;
	let calls = 0;
	const texts: string[] = [];
	const bodies: unknown[] = [];
	const authorizations: string[] = [];
	let aborted = 0;
	let modelsCalls = 0;
	let authCalls = 0;
	const authBodies: unknown[] = [];

	const server = createServer((request, response) => {
		const url = request.url ?? '';
		if (url.endsWith('/auth/keys')) {
			// The exchange of a sign-in: the code becomes a key.
			authCalls += 1;
			void readBody(request).then((raw) => {
				try {
					authBodies.push(JSON.parse(raw));
				} catch {
					authBodies.push(raw);
				}
				if (options.authFail) {
					response.writeHead(403, { 'content-type': 'application/json' });
					response.end(JSON.stringify({ error: { message: 'invalid code' } }));
					return;
				}
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ key: options.authKey }));
			});
			return;
		}
		if (url.endsWith('/models')) {
			// The list of the models: what a connection is tested against.
			modelsCalls += 1;
			authorizations.push(String(request.headers.authorization ?? ''));
			if (options.modelsStatus >= 300 && options.modelsStatus < 400) {
				response.writeHead(options.modelsStatus, { location: 'https://elsewhere.example/v1/models' });
				response.end();
				return;
			}
			response.writeHead(options.modelsStatus, { 'content-type': 'application/json' });
			response.end(
				JSON.stringify({
					object: 'list',
					data: options.models.map((id) => ({ id, object: 'model', owned_by: 'mock' })),
				}),
			);
			return;
		}
		if (!url.endsWith('/chat/completions')) {
			response.writeHead(404, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ error: { message: 'not found' } }));
			return;
		}
		calls += 1;
		authorizations.push(String(request.headers.authorization ?? ''));
		void readBody(request).then((raw) => {
			let body: unknown = raw;
			try {
				body = JSON.parse(raw);
			} catch {
				body = raw;
			}
			bodies.push(body);
			if (options.fail) {
				response.writeHead(500, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ error: { message: 'the upstream is down' } }));
				return;
			}
			const chunks = chunkTexts(options.chunkCount);
			// The usage comes only when the request asks for it.
			const sendUsage = !options.neverSendUsage && askedForUsage(body);
			// The tool call is answered once: the answer after it is the text.
			const toolCall = pendingToolCall;
			pendingToolCall = null;
			if (toolCall) {
				streamToolCall(response, toolCall, options, sendUsage, () => {
					aborted += 1;
				});
				return;
			}
			texts.push(chunks.join(''));
			streamAnswer(response, chunks, options, sendUsage, () => {
				aborted += 1;
			});
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
		get texts(): string[] {
			return texts;
		},
		get bodies(): unknown[] {
			return bodies;
		},
		get aborted(): number {
			return aborted;
		},
		get authorizations(): string[] {
			return authorizations;
		},
		get modelsCalls(): number {
			return modelsCalls;
		},
		get authCalls(): number {
			return authCalls;
		},
		get authBodies(): unknown[] {
			return authBodies;
		},
		get authKey(): string {
			return options.authKey;
		},
		lastBody(): unknown {
			return bodies[bodies.length - 1];
		},
		lastAuthorization(): string {
			return authorizations[authorizations.length - 1] ?? '';
		},
		setOptions(next: Partial<MockOptions>): void {
			options = { ...options, ...next };
			// A tool call that is asked for waits for the next answer.
			if (next.toolCall) pendingToolCall = next.toolCall;
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
function streamAnswer(
	response: ServerResponse,
	chunks: string[],
	options: MockOptions,
	sendUsage: boolean,
	onAbort: () => void,
): void {
	response.writeHead(200, {
		'content-type': 'text/event-stream',
		'cache-control': 'no-cache',
	});
	let index = 0;
	const send = () => {
		if (response.writableEnded || response.destroyed) return;
		const last = index === chunks.length - 1;
		response.write(serializeChunk(chunks[index], last, sendUsage));
		index += 1;
		if (last) {
			response.end('data: [DONE]\n\n');
			return;
		}
		setTimeout(send, options.chunkGapMs);
	};
	setTimeout(send, options.preDelayMs);
	response.on('close', () => {
		// The client went away before the end: the stream was cut.
		if (!response.writableEnded) {
			onAbort();
			response.destroy();
		}
	});
}

/**
 * The stream of one tool call: the call, then the end of the step.
 *
 * The step ends with `tool_calls`: the model asked for a tool, and the
 * answer comes after the tool has run.
 */
function streamToolCall(
	response: ServerResponse,
	toolCall: { name: string; arguments: Record<string, unknown> },
	options: MockOptions,
	sendUsage: boolean,
	onAbort: () => void,
): void {
	response.writeHead(200, {
		'content-type': 'text/event-stream',
		'cache-control': 'no-cache',
	});
	const id = `call_mock_${toolCall.name}`;
	const args = JSON.stringify(toolCall.arguments);
	const send = () => {
		if (response.writableEnded || response.destroyed) return;
		response.write(serializeToolCallChunk(id, toolCall.name, args, false, sendUsage));
		response.write(serializeToolCallChunk(id, toolCall.name, args, true, sendUsage));
		response.end('data: [DONE]\n\n');
	};
	setTimeout(send, options.preDelayMs);
	response.on('close', () => {
		if (!response.writableEnded) {
			onAbort();
			response.destroy();
		}
	});
}
