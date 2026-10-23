import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';

/**
 * A mock toxicity service: the /predict of text-embeddings-inference, in the
 * process of the test. The score of a text is chosen by the test; the answer
 * is the shape TEI gives for a batch: one array of {score, label} per input,
 * the best label first.
 */

export interface MockTeiOptions {
	/** The toxic score of a text. */
	score: (text: string) => number;
	/** The service answers with a 500. */
	fail: boolean;
	/** Awaited while the request is held, before the answer: a test edits the row here. */
	onRequest?: () => Promise<void>;
	/** The name of the toxic label (the model's id2label says 'toxic'). */
	toxicLabel: string;
	/** The whole prediction of a text, when a test needs labels other than toxic/neutral. */
	labels?: (text: string) => { label: string; score: number }[];
}

export interface MockTei {
	baseUrl: string;
	/** The bodies of the requests, in order. */
	readonly bodies: unknown[];
	setOptions(next: Partial<MockTeiOptions>): void;
	close(): Promise<void>;
}

function readBody(request: IncomingMessage): Promise<string> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		request.on('data', (chunk: Buffer) => chunks.push(chunk));
		request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		request.on('error', () => resolve(''));
	});
}

export async function startMockTei(initial?: Partial<MockTeiOptions>): Promise<MockTei> {
	let options: MockTeiOptions = { score: () => 0, fail: false, toxicLabel: 'toxic', ...initial };
	const bodies: unknown[] = [];
	const server = createServer((request, response) => {
		if (request.method !== 'POST' || request.url !== '/predict') {
			response.writeHead(404).end();
			return;
		}
		void readBody(request).then(async (raw) => {
			const parsed = JSON.parse(raw) as { inputs?: unknown };
			bodies.push(parsed);
			if (options.onRequest) await options.onRequest();
			if (options.fail) {
				response.writeHead(500, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ error: 'the classifier is down' }));
				return;
			}
			const inputs = Array.isArray(parsed.inputs) ? parsed.inputs.map(String) : [];
			const answer = inputs.map((text) => {
				if (options.labels) return options.labels(text);
				const toxic = options.score(text);
				const pair = [
					{ score: toxic, label: options.toxicLabel },
					{ score: 1 - toxic, label: 'neutral' },
				];
				return pair.sort((a, b) => b.score - a.score);
			});
			response.writeHead(200, { 'content-type': 'application/json' });
			response.end(JSON.stringify(answer));
		});
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
	const address = server.address();
	const port = address && typeof address === 'object' ? address.port : 0;
	return {
		baseUrl: `http://127.0.0.1:${port}`,
		get bodies(): unknown[] {
			return bodies;
		},
		setOptions(next: Partial<MockTeiOptions>): void {
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
