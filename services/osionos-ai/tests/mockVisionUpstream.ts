import { createServer } from 'node:http';
import { chunkTexts, streamAnswer } from './mockStream.ts';
import { readBody } from './mockRequest.ts';
import { askedForUsage } from './mockUpstream.ts';

/**
 * The mock upstream of the vision slice.
 *
 * It records the body of every call — that is how a test reads the request
 * the service sent — and it can answer with a refusal instead of a stream:
 * the answer of OpenRouter, word for word, is what the slice must
 * understand, and the service must turn it into a clear error.
 */
export interface VisionUpstream {
	/** The base URL of the mock: the service talks to `${baseUrl}/v1`. */
	baseUrl: string;
	/** The number of calls the upstream received. */
	readonly calls: number;
	/** The body of every request, in the order of the calls. */
	readonly bodies: unknown[];
	/** The status of the answers: 200 for a stream. */
	status: number;
	/** The body of a refusal, as the upstream sends it. */
	body: string;
	/** The number of the chunks of an answer. */
	chunkCount: number;
	/** The last body the upstream received. */
	lastBody(): unknown;
	close(): Promise<void>;
}

/** The answer of OpenRouter when no free model serves under the data policy. */
export const DATA_POLICY_404 =
	JSON.stringify({
		error: {
			message:
				'No endpoints found matching your data policy (Free model training). ' +
				'Enable "Free model training" in your OpenRouter privacy settings, or choose a different model.',
			code: 404,
		},
	});

/** The mock upstream of the vision tests, on a random port of the loopback. */
export async function startVisionUpstream(): Promise<VisionUpstream> {
	let calls = 0;
	const bodies: unknown[] = [];
	const mock: VisionUpstream = {
		baseUrl: '',
		get calls(): number {
			return calls;
		},
		bodies,
		status: 200,
		body: '',
		chunkCount: 2,
		lastBody(): unknown {
			return bodies[bodies.length - 1];
		},
		async close(): Promise<void> {
			await new Promise<void>((resolve) => {
				server.close(() => resolve());
				server.closeAllConnections?.();
			});
		},
	};

	const server = createServer((request, response) => {
		const url = request.url ?? '';
		if (!url.endsWith('/chat/completions')) {
			response.writeHead(404, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ error: { message: 'not found' } }));
			return;
		}
		calls += 1;
		void readBody(request).then((raw) => {
			let body: unknown = raw;
			try {
				body = JSON.parse(raw);
			} catch {
				body = raw;
			}
			bodies.push(body);
			if (mock.status !== 200) {
				response.writeHead(mock.status, { 'content-type': 'application/json' });
				response.end(mock.body);
				return;
			}
			const options = { preDelayMs: 0, chunkGapMs: 0, usage: null, parallelToolCalls: 1, chunkCount: mock.chunkCount };
			streamAnswer(response, chunkTexts(mock.chunkCount), options, askedForUsage(body), null, () => {
				// The client went away: the answer is cut, and the run is not.
			});
		});
	});

	await new Promise<void>((resolve) => {
		server.listen(0, '127.0.0.1', () => resolve());
	});
	const address = server.address();
	const port = address && typeof address === 'object' ? address.port : 0;
	mock.baseUrl = `http://127.0.0.1:${port}`;
	return mock;
}
