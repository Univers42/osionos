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
 *
 * The mock has a GATE: the requests wait at it, and the test opens it when it
 * wants. It is what makes an interleaving deterministic: the worker is held
 * inside the embedding, and everything else happens while it is held.
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
	/** The number of requests the mock received, answered or not. */
	readonly arrived: number;
	/** Every input of every call, in the order of the calls. */
	readonly inputs: string[];
	/** The body of every call, in the order of the calls. */
	readonly bodies: unknown[];
	setOptions(next: Partial<MockEmbedOptions>): void;
	/** The gate is closed: the requests wait for it to open. */
	closeGate(): void;
	/** The gate opens: the requests that wait go on. */
	openGate(): void;
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
	let arrived = 0;
	const inputs: string[] = [];
	const bodies: unknown[] = [];
	// The gate: closed, the requests wait; open, they go on.
	let gateClosed = false;
	const waiting: (() => void)[] = [];

	/** The wait at the gate: it returns when the gate is open. */
	const waitAtGate = async (): Promise<void> => {
		if (!gateClosed) return;
		await new Promise<void>((resolve) => {
			waiting.push(resolve);
		});
	};

	const server = createServer((request, response) => {
		if (!request.url?.endsWith('/embed')) {
			response.writeHead(404, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ error: 'not found' }));
			return;
		}
		// The request is received: the test waits for this to know that the
		// worker reached the service.
		arrived += 1;
		void readBody(request).then(async (raw) => {
			await waitAtGate();
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
		get arrived(): number {
			return arrived;
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
		closeGate(): void {
			gateClosed = true;
		},
		openGate(): void {
			gateClosed = false;
			for (const resolve of waiting.splice(0)) resolve();
		},
		async close(): Promise<void> {
			await new Promise<void>((resolve) => {
				server.close(() => resolve());
				server.closeAllConnections?.();
			});
		},
	};
}
