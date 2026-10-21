import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * The mock of the speech-to-text server.
 *
 * It is the deployment's own server, on a random port of the loopback: the
 * route reaches it over the network, exactly as it reaches the real one. It
 * keeps the bytes it received — the test asserts that the file the STT server
 * gets is the canonical WAV and not the bytes of the client.
 */

export type MockSttMode = 'ok' | 'hang' | 'error';

export interface MockStt {
	/** The base URL of the mock: the route calls `${baseUrl}/v1/audio/transcriptions`. */
	baseUrl: string;
	/** The mode of the next calls: answer, never answer, or refuse. */
	mode: MockSttMode;
	/** The text the mock answers. */
	text: string;
	/** The bytes of the file of every call, in order. */
	files: Buffer[];
	/** The form fields of every call, in order. */
	fields: Record<string, string>[];
	/** The number of calls the mock received. */
	calls(): number;
	/** Waits until the mock received `count` calls. */
	waitForCalls(count: number): Promise<void>;
	/** Stops the mock and closes every socket it holds. */
	close(): Promise<void>;
}

/** The body of a request, as bytes. */
async function readBody(request: IncomingMessage): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) chunks.push(Buffer.from(chunk as Buffer));
	return Buffer.concat(chunks);
}

/** The multipart fields of a body, and the bytes of its file. */
async function parseForm(
	request: IncomingMessage,
	body: Buffer,
): Promise<{ fields: Record<string, string>; file: Buffer | null }> {
	const contentType = String(request.headers['content-type'] ?? '');
	const form = await new Response(body, { headers: { 'content-type': contentType } }).formData();
	const fields: Record<string, string> = {};
	let file: Buffer | null = null;
	for (const [key, value] of form.entries()) {
		if (typeof value === 'string') fields[key] = value;
		else file = Buffer.from(await value.arrayBuffer());
	}
	return { fields, file };
}

/** The mock of the speech-to-text server, on a random port. */
export async function startMockStt(): Promise<MockStt> {
	const files: Buffer[] = [];
	const fields: Record<string, string>[] = [];
	const sockets = new Set<import('node:net').Socket>();
	let mode: MockSttMode = 'ok';
	let text = 'the text of the mock';

	const server = createServer((request: IncomingMessage, response: ServerResponse) => {
		void (async () => {
			const body = await readBody(request);
			const parsed = await parseForm(request, body);
			files.push(parsed.file ?? Buffer.alloc(0));
			fields.push(parsed.fields);
			if (mode === 'hang') return; // never answers: the caller's deadline ends it
			if (mode === 'error') {
				response.writeHead(500, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ error: { message: 'the mock refuses' } }));
				return;
			}
			response.writeHead(200, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ text }));
		})();
	});
	server.on('connection', (socket) => {
		sockets.add(socket);
		socket.on('close', () => sockets.delete(socket));
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
	const address = server.address();
	const port = address && typeof address === 'object' ? address.port : 0;

	return {
		baseUrl: `http://127.0.0.1:${port}`,
		get mode() {
			return mode;
		},
		set mode(next: MockSttMode) {
			mode = next;
		},
		get text() {
			return text;
		},
		set text(next: string) {
			text = next;
		},
		files,
		fields,
		calls: () => files.length,
		async waitForCalls(count: number): Promise<void> {
			for (let waited = 0; waited < 200 && files.length < count; waited += 1) {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
		},
		async close(): Promise<void> {
			for (const socket of sockets) socket.destroy();
			await new Promise<void>((resolve) => server.close(() => resolve()));
		},
	};
}
