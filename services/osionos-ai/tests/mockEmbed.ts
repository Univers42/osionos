import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { createHash } from 'node:crypto';

/**
 * A mock embedding service: the /embed of text-embeddings-inference, in the
 * process of the test.
 *
 * The vectors are DETERMINISTIC: the same input always gives the same vector,
 * so a test can tell a chunk that was embedded again from a chunk that was
 * kept. The mock counts its calls and keeps every input it received.
 */

export interface MockEmbedOptions {
	/** The wait before the answer: a slow service is a slow worker. */
	delayMs: number;
	/** The service answers with a 500. */
	fail: boolean;
	/** The number of dimensions of the vectors. */
	dims: number;
}

export interface MockEmbedder {
	/** The base URL of the mock: the client talks to `${baseUrl}/embed`. */
	baseUrl: string;
	/** The number of calls the mock received. */
	readonly calls: number;
	/** Every input of every call, in the order of the calls. */
	readonly inputs: string[];
	/** The body of every call, in the order of the calls. */
	readonly bodies: unknown[];
	setOptions(next: Partial<MockEmbedOptions>): void;
	close(): Promise<void>;
}

const DEFAULT_OPTIONS: MockEmbedOptions = {
	delayMs: 0,
	fail: false,
	dims: 384,
};

/**
 * The vector of an input: `dims` numbers, derived from the hash of the text.
 * The same input always gives the same vector.
 */
export function vectorFor(input: string, dims = 384): number[] {
	const digest = createHash('sha256').update(input, 'utf8').digest();
	const vector: number[] = [];
	for (let index = 0; index < dims; index += 1) {
		vector.push(digest[index % digest.length] / 127.5 - 1);
	}
	return vector;
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

/** The mock embedding service, on a random port of the loopback. */
export async function startMockEmbedder(initial?: Partial<MockEmbedOptions>): Promise<MockEmbedder> {
	let options: MockEmbedOptions = { ...DEFAULT_OPTIONS, ...initial };
	let calls = 0;
	const inputs: string[] = [];
	const bodies: unknown[] = [];

	const server = createServer((request, response) => {
		if (!request.url?.endsWith('/embed')) {
			response.writeHead(404, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ error: 'not found' }));
			return;
		}
		void readBody(request).then((raw) => {
			calls += 1;
			let parsed: { inputs?: unknown } = {};
			try {
				parsed = JSON.parse(raw) as { inputs?: unknown };
			} catch {
				parsed = {};
			}
			bodies.push(parsed);
			const list = Array.isArray(parsed.inputs) ? parsed.inputs.map(String) : [];
			inputs.push(...list);
			const answer = (): void => {
				if (options.fail) {
					response.writeHead(500, { 'content-type': 'application/json' });
					response.end(JSON.stringify({ error: 'the embedding service is down' }));
					return;
				}
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(JSON.stringify(list.map((input) => vectorFor(input, options.dims))));
			};
			if (options.delayMs > 0) {
				setTimeout(answer, options.delayMs);
				return;
			}
			answer();
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
		get inputs(): string[] {
			return inputs;
		},
		get bodies(): unknown[] {
			return bodies;
		},
		setOptions(next: Partial<MockEmbedOptions>): void {
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
