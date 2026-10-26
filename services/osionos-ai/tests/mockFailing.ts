import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { askedForUsage } from './mockUpstream.ts';
import { chunkTexts, serializeChunk, streamAnswer, streamToolCall } from './mockStream.ts';
import type { StreamOptions } from './mockStream.ts';
import { readBody } from './mockRequest.ts';

/**
 * A scripted upstream for the failover tests: what a request gets depends on
 * the MODEL it names, and each model has its own list of answers, used once
 * each, in order. A model whose list is spent answers `ok`.
 *
 * The plain mock cannot do this: its failure is one switch for every model.
 */

export type Behaviour =
	/** A full answer, with the usage the mock was given. */
	| 'ok'
	/** HTTP status before any byte of the stream. */
	| 429
	| 500
	| 503
	| 400
	/** The socket dies before the first byte. */
	| 'reset'
	/** One chunk of text, then the socket dies. */
	| 'text_then_break'
	/** A tool call (finish: tool_calls), the answer of the NEXT request is the next entry. */
	| 'tool';

export interface Scripted {
	behaviour: Behaviour;
	/** Wait before answering: a test arms something while the request is in flight. */
	delayMs?: number;
}

export interface FailingUpstream {
	baseUrl: string;
	/** Every request, in order: the model it named. */
	readonly requests: string[];
	/** The requests that named `model`. */
	countFor(model: string): number;
	/** The body of every request, in order. */
	readonly bodies: unknown[];
	/** The answers `model` gives, in order (they replace the previous list). */
	script(model: string, ...answers: (Behaviour | Scripted)[]): void;
	/** `model` answers `behaviour` to every request once its list is spent. */
	always(model: string, behaviour: Behaviour): void;
	/** The usage every `ok` answer reports. */
	setUsage(usage: { promptTokens: number; completionTokens: number } | null): void;
	reset(): void;
	close(): Promise<void>;
}

const ERROR_BODY = JSON.stringify({ error: { message: 'scripted failure', type: 'scripted' } });

function sendStatus(response: ServerResponse, status: number): void {
	response.writeHead(status, { 'content-type': 'application/json' });
	response.end(ERROR_BODY);
}

export async function startFailingUpstream(): Promise<FailingUpstream> {
	const requests: string[] = [];
	const bodies: unknown[] = [];
	const scripts = new Map<string, Scripted[]>();
	const steady = new Map<string, Behaviour>();
	let usage: StreamOptions['usage'] = { promptTokens: 1000, completionTokens: 500 };
	const stream = (): StreamOptions => ({ preDelayMs: 0, chunkCount: 4, chunkGapMs: 0, usage, parallelToolCalls: 1 });

	const server = createServer((request, response) => {
		if ((request.url ?? '').endsWith('/models')) {
			// A connection is tested against the list before it is saved.
			response.writeHead(200, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ object: 'list', data: [{ id: 'user-model', object: 'model', owned_by: 'mock' }] }));
			return;
		}
		if (!(request.url ?? '').endsWith('/chat/completions')) {
			sendStatus(response, 404);
			return;
		}
		void readBody(request).then((raw) => {
			const body = JSON.parse(raw) as { model?: string };
			const model = String(body.model);
			requests.push(model);
			bodies.push(body);
			const next = scripts.get(model)?.shift() ?? { behaviour: steady.get(model) ?? ('ok' as const) };
			setTimeout(() => answer(response, next.behaviour, askedForUsage(body)), next.delayMs ?? 0);
		});
	});

	function answer(response: ServerResponse, behaviour: Behaviour, sendUsage: boolean): void {
		if (typeof behaviour === 'number') return sendStatus(response, behaviour);
		if (behaviour === 'reset') return void response.socket?.destroy();
		if (behaviour === 'text_then_break') {
			response.writeHead(200, { 'content-type': 'text/event-stream' });
			response.write(serializeChunk('partial ', false, false, null));
			// A flush before the break: the client must have read the chunk.
			setTimeout(() => response.socket?.destroy(), 50);
			return;
		}
		if (behaviour === 'tool') {
			streamToolCall(response, { name: 'read_page', arguments: { pageId: 'not-a-uuid' } }, stream(), sendUsage, usage, () => undefined);
			return;
		}
		streamAnswer(response, chunkTexts(4), stream(), sendUsage, usage, () => undefined);
	}

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
	const address = server.address();
	const port = address && typeof address === 'object' ? address.port : 0;
	return {
		baseUrl: `http://127.0.0.1:${port}`,
		requests,
		bodies,
		countFor: (model) => requests.filter((name) => name === model).length,
		script(model, ...answers) {
			scripts.set(model, answers.map((item) => (typeof item === 'object' ? item : { behaviour: item })));
		},
		always(model, behaviour) {
			steady.set(model, behaviour);
		},
		setUsage(next) {
			usage = next;
		},
		reset() {
			requests.length = 0;
			bodies.length = 0;
			scripts.clear();
			steady.clear();
			usage = { promptTokens: 1000, completionTokens: 500 };
		},
		close: () =>
			new Promise<void>((resolve) => {
				server.close(() => resolve());
				server.closeAllConnections?.();
			}),
	};
}
