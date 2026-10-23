import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';

export interface BridgeCall {
	method: string;
	path: string;
	body: unknown;
	authorization: string;
	bytes: Buffer;
	contentType: string;
}

export interface BridgeFile {
	bytes: Uint8Array;
	contentType: string;
	status?: number;
	location?: string;
}

export interface MockBridge {
	baseUrl: string;
	readonly calls: readonly BridgeCall[];
	ofMethod(method: string): BridgeCall[];
	readonly count: number;
	failWith: number;
	delayMs: number;
	failNextWith(status: number, n: number): void;
	loseNextAnswers(n: number): void;
	serve(path: string, file: BridgeFile): void;
	readonly files: ReadonlyMap<string, BridgeFile>;
	/** A hook that runs before the mock answers a PATCH, e.g. to mirror the archive in the database. */
	onPatch?: (call: { path: string; body: unknown }) => void | Promise<void>;
	reset(): void;
	close(): Promise<void>;
}

function readBody(request: IncomingMessage): Promise<Buffer> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		request.on('data', (chunk: Buffer) => chunks.push(chunk));
		request.on('end', () => resolve(Buffer.concat(chunks)));
		request.on('error', () => resolve(Buffer.alloc(0)));
	});
}

export const MOCK_MEDIA_OWNER = '00000000-0000-4000-8000-0000000000aa';

export async function startMockBridge(): Promise<MockBridge> {
	const calls: BridgeCall[] = [];
	const files = new Map<string, BridgeFile>();
	let failNextStatus = 0;
	let failNextCount = 0;
	let loseNextCount = 0;
	const seenPages = new Map<string, string>(); // id -> workspaceId
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
		loseNextAnswers(n: number): void {
			loseNextCount = n;
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
			loseNextCount = 0;
		},
		async close(): Promise<void> {
			await new Promise<void>((resolve) => {
				server.close(() => resolve());
				server.closeAllConnections?.();
			});
		},
	};

	const server = createServer((request, response) => {
		void readBody(request).then(async (bytes) => {
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

			// GET /api/pages/<id>
			if (method === 'GET' && path.startsWith('/api/pages/')) {
				const pid = decodeURIComponent(path.slice('/api/pages/'.length));
				if (seenPages.has(pid)) {
					response.writeHead(200, { 'content-type': 'application/json' });
					response.end(JSON.stringify({ id: pid, workspaceId: seenPages.get(pid), title: 'Page' }));
					return;
				}
				response.writeHead(404, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ error: 'not found' }));
				return;
			}

			const isPage = method === 'POST' && path === '/api/pages';
			const isDb = method === 'POST' && path === '/api/object-databases';

			if (isPage || isDb) {
				// loseNextAnswers: store, then 503.
				if (loseNextCount > 0) {
					loseNextCount--;
					const reqBody = body as { id?: unknown; dbKey?: unknown; workspaceId?: unknown } | null;
					if (isPage && typeof reqBody?.id === 'string') {
						seenPages.set(reqBody.id, typeof reqBody.workspaceId === 'string' ? reqBody.workspaceId : '');
					}
					if (isDb && typeof reqBody?.dbKey === 'string') seenDbs.add(reqBody.dbKey);
					response.writeHead(503, { 'content-type': 'application/json' });
					response.end(JSON.stringify({ error: 'service unavailable' }));
					return;
				}
				if (failNextCount > 0) {
					failNextCount--;
					const status = failNextStatus;
					response.writeHead(status, { 'content-type': 'application/json' });
					response.end(JSON.stringify({ error: 'failed' }));
					return;
				}
				if (mock.failWith) {
					response.writeHead(mock.failWith, { 'content-type': 'application/json' });
					response.end(JSON.stringify({ error: { message: 'refused' } }));
					return;
				}
				const finish = () => {
					if (isPage) {
						const reqBody = body as { id?: unknown; title?: unknown; workspaceId?: unknown } | null;
						const id = typeof reqBody?.id === 'string' ? reqBody.id : null;
						const title = typeof reqBody?.title === 'string' ? reqBody.title : 'Untitled';
						const workspaceId = typeof reqBody?.workspaceId === 'string' ? reqBody.workspaceId : '';
						if (id && seenPages.has(id)) {
							// real bridge: duplicate id is a unique violation -> 502
							response.writeHead(502, { 'content-type': 'application/json' });
							response.end(JSON.stringify({ error: 'BaaS request failed with 409' }));
							return;
						}
						if (id) {
							seenPages.set(id, workspaceId);
							response.writeHead(201, { 'content-type': 'application/json' });
							response.end(JSON.stringify({ _id: id, title }));
							return;
						}
						response.writeHead(201, { 'content-type': 'application/json' });
						response.end(JSON.stringify({ _id: randomUUID(), title }));
						return;
					}
					const reqBody = body as { dbKey?: unknown; ifAbsent?: unknown } | null;
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
				if (failNextCount > 0) {
					failNextCount--;
					response.writeHead(failNextStatus, { 'content-type': 'application/json' });
					response.end(JSON.stringify({ error: 'failed' }));
					return;
				}
				try {
					await mock.onPatch?.({ path, body });
				} catch {
					response.writeHead(500, { 'content-type': 'application/json' });
					response.end(JSON.stringify({ error: { message: 'hook failed' } }));
					return;
				}
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
