import { createServer } from 'node:http';
import { chunkTexts, streamAnswer, streamToolCall } from './mockStream.ts';
import type { StreamOptions } from './mockStream.ts';
import { lastUserText, readBody } from './mockRequest.ts';

/**
 * A mock OpenAI-compatible upstream: the SSE of the P0a spike, with the knobs
 * the tests need (the delay before the first chunk, the number of chunks, the
 * gap between two chunks, a failure mode) and a counter of the calls.
 */

export interface MockOptions extends StreamOptions {
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
	toolCall: { name: string; arguments: Record<string, unknown>; also?: { name: string; arguments: Record<string, unknown> }[] } | null;
	/** The exact answer text, instead of the mock's "part-0 part-1 …" chunks. */
	answerText: string | null;
	/**
	 * The word that arms the tool call.
	 *
	 * The mock answers with the tool call only when the request carries the
	 * word: the CONTINUATION of a decision is a run of its own, and it must
	 * not steal the tool call of the next test. Null arms every request.
	 */
	toolCallTrigger: string | null;
	/**
	 * The model calls the tool on EVERY step, not only on the first one.
	 *
	 * A model that keeps calling a tool is a loop that keeps spending.
	 */
	toolCallEveryStep: boolean;
	/**
	 * The usage the upstream reports is the one of the FIRST step only.
	 *
	 * A test that needs one expensive step (and cheap ones after it) says so
	 * here: the run pays for what the upstream really charged, and the
	 * ledger reads the usage of every step.
	 */
	usageOnFirstStepOnly: boolean;
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
	toolCallText: null,
	answerText: null,
	toolCallTrigger: null,
	usage: null,
	toolCallEveryStep: false,
	parallelToolCalls: 1,
	usageOnFirstStepOnly: false,
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

/**
 * Whether the request asks for NO tool: `tool_choice: none`, or no tool at
 * all.
 *
 * A real model obeys it and answers with text. The mock obeys it too: a step
 * that runs without tools is a step that answers, and a test that counts the
 * steps of a loop needs the mock to stop calling the tool.
 */
export function askedForNoTool(body: unknown): boolean {
	const request = body as { tools?: unknown; tool_choice?: unknown } | null;
	if (!request || typeof request !== 'object') return false;
	if (request.tool_choice === 'none') return true;
	return !Array.isArray(request.tools) || request.tools.length === 0;
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
		const step = calls;
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
			const chunks = options.answerText ? [options.answerText] : chunkTexts(options.chunkCount);
			// The usage comes only when the request asks for it.
			const sendUsage = !options.neverSendUsage && askedForUsage(body);
			// The usage of this step: the one of the test, or the default one
			// when the test wants the expensive step alone.
			const usage = options.usageOnFirstStepOnly && step > 1 ? null : options.usage;
			// The tool call is answered once: the answer after it is the text.
			// A model that calls a tool on every step keeps the loop going.
			// The trigger arms the call: a request that does not carry it gets
			// the text, and the call waits for the next one.
			const armed =
				options.toolCallTrigger === null ||
				lastUserText(body).includes(options.toolCallTrigger);
			const toolCall = armed
				? options.toolCallEveryStep
					? options.toolCall
					: pendingToolCall
				: null;
			if (armed) pendingToolCall = null;
			// A step that runs without tools is a step that answers: the
			// model obeys the request and writes text.
			if (toolCall && !askedForNoTool(body)) {
				streamToolCall(response, toolCall, options, sendUsage, usage, () => {
					aborted += 1;
				});
				return;
			}
			texts.push(chunks.join(''));
			streamAnswer(response, chunks, options, sendUsage, usage, () => {
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
