import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';

/**
 * The mock bridge: the HTTP API of the bridge, without the bridge.
 *
 * It records EVERY call — the method, the path, the body, and the
 * Authorization header — so a test can prove what did NOT go out: no DELETE,
 * no `visibility`, no token in a body.
 */

export interface BridgeCall {
	method: string;
	path: string;
	/** The body of the call, parsed. */
	body: unknown;
	/** The Authorization header of the call: the token, and where it went. */
	authorization: string;
	/** The bytes of the body, untouched: an upload is not text. */
	bytes: Buffer;
	/** The Content-Type header of the call. */
	contentType: string;
}

/**
 * A file the mock bridge serves: the bytes, the type, and the status.
 */
export interface BridgeFile {
	bytes: Uint8Array;
	contentType: string;
	/** The status of the answer: 200 for the real one. */
	status?: number;
	/** The `location` of a redirect answer. */
	location?: string;
}

export interface MockBridge {
	/** The base URL of the mock: the service talks to it directly. */
	baseUrl: string;
	/** The calls, in the order they arrived. */
	readonly calls: readonly BridgeCall[];
	/** The calls of one method. */
	ofMethod(method: string): BridgeCall[];
	/** The number of the calls. */
	readonly count: number;
	/** The status the next answers carry: 0 for the real one. */
	failWith: number;
	/** The delay applied to POST /api/pages and /api/object-databases, in ms. */
	delayMs: number;
	/** Make the next n of those calls answer `status` without remembering them. */
	failNextWith(status: number, n: number): void;
	/** Serves a file at a path: the bytes of an attachment. */
	serve(path: string, file: BridgeFile): void;
	/** The files the mock serves, by path. */
	readonly files: ReadonlyMap<string, BridgeFile>;
	/** Forget the calls. */
	reset(): void;
	close(): Promise<void>;
}

/** The body of a request, read to the end. */
function readBody(request: IncomingMessage): Promise<Buffer> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		request.on('data', (chunk: Buffer) => chunks.push(chunk));
		request.on('end', () => resolve(Buffer.concat(chunks)));
		request.on('error', () => resolve(Buffer.alloc(0)));
	});
}

/** The owner of the media the mock stores: the bridge puts the uploader's id there. */
export const MOCK_MEDIA_OWNER = '00000000-0000-4000-8000-0000000000aa';

/** The mock bridge, on a random port of the loopback. */
export async function startMockBridge(): Promise<MockBridge> {
	const calls: BridgeCall[] = [];
	const files = new Map<string, BridgeFile>();
	let failNextStatus = 0;
	let failNextCount = 0;
	const seenPages = new Set<string>();
	const seenDbs = new Set<string>();

	const mock: MockBridge = {
		baseUrl: '',
		calls,
		ofMethod(method: string): BridgeCall[] {
			return calls.filter((call) => call.method === method);
		},
		get count(): number {
			return calls.length;
		},
		failWith: 0,
		delayMs: 0,
		failNextWith(status: number, n: number): void {
			failNextStatus = status;
			failNextCount = n;
		},
		serve(path: string, file: BridgeFile): void {
			files.set(path, file);
		},
		get files(): ReadonlyMap<string, BridgeFile> {
			return files;
		},
		reset(): void {
			calls.length = 0;
			seenPages.clear();
			seenDbs.clear();
			failNextStatus = 0;
			failNextCount = 0;
		},
		async close(): Promise<void> {
			await new Promise<void>((resolve) => {
				server.close(() => resolve());
				server.closeAllConnections?.();
			});
		},
	};

	const server = createServer((request, response) => {
		void readBody(request).then((bytes) => {
			const raw = bytes.toString('utf8');
			let body: unknown = raw;
			try {
				body = JSON.parse(raw);
			} catch {
				body = raw;
			}
			calls.push({
				method: request.method ?? '',
				path: request.url ?? '',
				body,
				authorization: String(request.headers.authorization ?? ''),
				bytes,
				contentType: String(request.headers['content-type'] ?? ''),
			});
			const path = request.url ?? '';
			const method = request.method ?? '';

			// A file the mock serves.
			const file = files.get(path);
			if (file) {
				if (file.status && file.status !== 200) {
					response.writeHead(file.status, {
						'content-type': 'application/json',
						...(file.location ? { location: file.location } : {}),
					});
					response.end(JSON.stringify({ error: { message: 'refused' } }));
					return;
				}
				response.writeHead(200, {
					'content-type': file.contentType,
					'content-length': String(file.bytes.length),
				});
				response.end(Buffer.from(file.bytes));
				return;
			}

			const isPage = method === 'POST' && path === '/api/pages';
			const isDb = method === 'POST' && path === '/api/object-databases';

			if (isPage || isDb) {
				// failNextWith
				if (failNextCount > 0) {
					failNextCount--;
					const status = failNextStatus;
					response.writeHead(status, { 'content-type': 'application/json' });
					response.end(JSON.stringify({ error: 'failed' }));
					return;
				}
				// global failWith
				if (mock.failWith) {
					response.writeHead(mock.failWith, { 'content-type': 'application/json' });
					response.end(JSON.stringify({ error: { message: 'refused' } }));
					return;
				}
				const finish = () => {
					if (isPage) {
						const reqBody = body as { id?: unknown; title?: unknown } | null;
						const id = typeof reqBody?.id === 'string' ? reqBody.id : null;
						const title = typeof reqBody?.title === 'string' ? reqBody.title : 'Untitled';
						if (id && seenPages.has(id)) {
							response.writeHead(200, { 'content-type': 'application/json' });
							response.end(JSON.stringify({ _id: id, title }));
							return;
						}
						if (id) {
							seenPages.add(id);
							response.writeHead(201, { 'content-type': 'application/json' });
							response.end(JSON.stringify({ _id: id, title }));
							return;
						}
						response.writeHead(201, { 'content-type': 'application/json' });
						response.end(JSON.stringify({ _id: randomUUID(), title }));
						return;
					}
					// object-databases
					const reqBody = body as { dbKey?: unknown; title?: unknown; ifAbsent?: unknown } | null;
					const dbKey = typeof reqBody?.dbKey === 'string' ? reqBody.dbKey : '';
					const ifAbsent = reqBody?.ifAbsent === true;
					if (ifAbsent && seenDbs.has(dbKey)) {
						response.writeHead(409, { 'content-type': 'application/json' });
						response.end(JSON.stringify({ error: 'db_exists' }));
						return;
					}
					seenDbs.add(dbKey);
					response.writeHead(200, { 'content-type': 'application/json' });
					response.end(JSON.stringify({ ok: true, dbKey }));
				};
				if (mock.delayMs > 0) {
					setTimeout(finish, mock.delayMs);
				} else {
					finish();
				}
				return;
			}

			if (mock.failWith) {
				response.writeHead(mock.failWith, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ error: { message: 'refused' } }));
				return;
			}

			if (request.method === 'POST' && path === '/api/pages') {
				// fallback (shouldn't reach here)
				const title = (body as { title?: unknown } | null)?.title;
				response.writeHead(201, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ _id: randomUUID(), title: typeof title === 'string' ? title : 'Untitled' }));
				return;
			}
			if (request.method === 'POST' && path.startsWith('/api/media/uploads?')) {
				const sha256 = createHash('sha256').update(bytes).digest('hex');
				const mimeType = String(request.headers['content-type'] ?? '');
				const ext = mimeType.split('/')[1] ?? 'bin';
				response.writeHead(201, { 'content-type': 'application/json' });
				response.end(JSON.stringify({
					ok: true,
					media: {
						url: `/api/media/uploads/${MOCK_MEDIA_OWNER}/${sha256}.${ext}`,
						type: 'image',
						name: new URL(path, 'https://bridge').searchParams.get('name') ?? '',
						mimeType,
						size: bytes.length,
						sha256,
					},
				}));
				return;
			}
			if (request.method === 'PATCH' && /^\/api\/pages\/[^/]+$/.test(path)) {
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ ok: true }));
				return;
			}
			response.writeHead(404, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ error: { message: 'not found' } }));
		});
	});

	await new Promise<void>((resolve) => {
		server.listen(0, '127.0.0.1', () => resolve());
	});
	server.unref();
	const address = server.address();
	const port = address && typeof address === 'object' ? address.port : 0;
	mock.baseUrl = `http://127.0.0.1:${port}`;
	return mock;
}
