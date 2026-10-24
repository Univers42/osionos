import { createServer } from 'node:http';
import { readBody } from './mockRequest.ts';

/**
 * The mock of the llama-server of "Describe image": the OpenAI chat route,
 * recording every body, and counting how many calls are in flight at once —
 * that is how a test proves the service keeps the single slot of the server.
 */
export interface MockVlm {
	baseUrl: string;
	/** The body of every call, parsed. */
	readonly bodies: Record<string, unknown>[];
	/** The most calls that were in flight at the same moment. */
	readonly maxInFlight: number;
	/** The `content` of the answer: a JSON string, or any text. */
	content: string;
	/** The status of the answer. */
	status: number;
	/** Milliseconds the answer is held back; `Infinity` never answers. */
	delayMs: number;
	close(): Promise<void>;
}

/** The answer of a good model: the five keys of the schema. */
export const GOOD_ANSWER = {
	caption: 'A red bicycle leaning on a brick wall.',
	tags: ['Bicycle', ' wall ', 'bicycle', '', 'Street'],
	objects: ['bicycle', 'wall'],
	ocr: 'BIKE SHOP',
	safety: 'safe',
};

export async function startMockVlm(): Promise<MockVlm> {
	const bodies: Record<string, unknown>[] = [];
	let inFlight = 0;
	let maxInFlight = 0;
	const mock: MockVlm = {
		baseUrl: '',
		bodies,
		get maxInFlight(): number {
			return maxInFlight;
		},
		content: JSON.stringify(GOOD_ANSWER),
		status: 200,
		delayMs: 0,
		close: () =>
			new Promise<void>((resolve) => {
				server.close(() => resolve());
				server.closeAllConnections?.();
			}),
	};
	const server = createServer((request, response) => {
		void readBody(request).then(async (raw) => {
			bodies.push(JSON.parse(raw) as Record<string, unknown>);
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			try {
				// A client that gave up (timeout) is no longer in flight, whatever the delay.
				if (mock.delayMs > 0) {
					await new Promise<void>((resolve) => {
						const timer = setTimeout(resolve, Math.min(mock.delayMs, 60_000));
						response.once('close', () => {
							clearTimeout(timer);
							resolve();
						});
					});
				}
				if (response.destroyed) return;
				if (request.url !== '/v1/chat/completions') {
					response.writeHead(404).end();
					return;
				}
				response.writeHead(mock.status, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: mock.content } }] }));
			} finally {
				inFlight -= 1;
			}
		});
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
	server.unref();
	const address = server.address();
	mock.baseUrl = `http://127.0.0.1:${address && typeof address === 'object' ? address.port : 0}`;
	return mock;
}
