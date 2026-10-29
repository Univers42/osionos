import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pngBytes, svgBytes } from './visionFixtures.ts';

/**
 * The mock of the image engine: stable-diffusion.cpp's sd-server, without the
 * GPU.
 *
 * It answers `/v1/images/generations` the way sd-server does (A1, C71): one
 * `b64_json` PNG and no usage. The PNG carries a `tEXt` chunk with the prompt,
 * as sd-server writes one without `--disable-image-metadata`, so a test can
 * prove the stored file has none. It records every body and the number of
 * calls in flight, so a test can prove the queue lets one call through at a
 * time.
 */

export type MockImageEngineMode = 'ok' | 'hold' | 'hang' | 'error' | 'svg' | 'huge';

export interface MockImageEngine {
	/** The base URL of the mock: the service calls `${baseUrl}/v1/images/generations`. */
	baseUrl: string;
	/** The mode of the next calls. */
	mode: MockImageEngineMode;
	/** The JSON body of every call, in order. */
	readonly bodies: Record<string, unknown>[];
	/** The path of every call, in order. */
	readonly paths: string[];
	/** The most calls that were ever in flight at once. */
	readonly maxInFlight: number;
	/** Waits until the mock received `count` calls. */
	waitForCalls(count: number): Promise<void>;
	/** Answers every call the 'hold' mode keeps waiting. */
	release(): void;
	/** Forgets the calls and the high-water mark. */
	reset(): void;
	close(): Promise<void>;
}

/** The PNG of a prompt: 512 × 512, with the prompt in a `tEXt` chunk. */
export function enginePng(prompt: string, size = 512): Uint8Array {
	const text = [...Buffer.from('parameters\0', 'latin1'), ...Buffer.from(prompt, 'latin1')];
	return pngBytes({ width: size, height: size, chunks: [{ type: 'tEXt', data: text }] });
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) chunks.push(Buffer.from(chunk as Buffer));
	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
	} catch {
		return {};
	}
}

/** The mock of the image engine, on a random port of the loopback. */
export async function startMockImageEngine(): Promise<MockImageEngine> {
	const bodies: Record<string, unknown>[] = [];
	const paths: string[] = [];
	const held: (() => void)[] = [];
	let inFlight = 0;
	let maxInFlight = 0;

	const answer = (response: ServerResponse, mode: MockImageEngineMode, prompt: string): void => {
		if (mode === 'error') {
			response.writeHead(500, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ error: { message: 'engine failed' } }));
			return;
		}
		const bytes =
			mode === 'svg' ? svgBytes() : mode === 'huge' ? enginePng(prompt, 8192) : enginePng(prompt);
		response.writeHead(200, { 'content-type': 'application/json' });
		response.end(JSON.stringify({ created: 1, data: [{ b64_json: Buffer.from(bytes).toString('base64') }] }));
	};

	const mock: MockImageEngine = {
		baseUrl: '',
		mode: 'ok',
		bodies,
		paths,
		get maxInFlight(): number {
			return maxInFlight;
		},
		async waitForCalls(count: number): Promise<void> {
			const deadline = Date.now() + 10_000;
			while (bodies.length < count) {
				if (Date.now() > deadline) throw new Error(`the engine saw ${bodies.length} calls, not ${count}`);
				await new Promise((resolve) => setTimeout(resolve, 20));
			}
		},
		release(): void {
			for (const go of held.splice(0)) go();
		},
		reset(): void {
			bodies.length = 0;
			paths.length = 0;
			maxInFlight = 0;
		},
		async close(): Promise<void> {
			mock.release();
			await new Promise<void>((resolve) => {
				server.close(() => resolve());
				server.closeAllConnections?.();
			});
		},
	};

	const server = createServer((request, response) => {
		void readJson(request).then((body) => {
			bodies.push(body);
			paths.push(request.url ?? '');
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			const mode = mock.mode;
			const prompt = typeof body.prompt === 'string' ? body.prompt : '';
			// A call leaves the count once: when it is answered, or when its
			// client goes away first (a cancel, a timeout).
			let counted = true;
			const leave = (): void => {
				if (!counted) return;
				counted = false;
				inFlight -= 1;
			};
			const finish = (): void => {
				leave();
				if (!response.destroyed) answer(response, mode, prompt);
			};
			response.on('close', leave);
			if (mode === 'hang') return;
			if (mode === 'hold') {
				held.push(finish);
				return;
			}
			finish();
		});
	});

	await new Promise<void>((resolve) => {
		server.listen(0, '127.0.0.1', () => resolve());
	});
	server.unref();
	const address = server.address();
	mock.baseUrl = `http://127.0.0.1:${address && typeof address === 'object' ? address.port : 0}`;
	return mock;
}
