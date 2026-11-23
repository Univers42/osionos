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
	/** A hook that runs before the mock answers a page or database POST; a throw answers 500 (retryable). */
	onPost?: (call: { path: string; body: unknown }) => void | Promise<void>;
	/**
	 * The content and version of a page the append route (POST /api/pages/:id/blocks)
	 * writes to. The route mirrors public.osionos_page_append: the anchor is a TOP-LEVEL
	 * block id (an unknown one appends at the end), a repeated idempotency key appends
	 * nothing, and every append bumps the version.
	 */
	seedPage(pageId: string, content: unknown[], version?: number | null, title?: string): void;
	pageContent(pageId: string): { version: number | null; content: unknown[]; title: string; archivedAt: string | null } | undefined;
	/** The next n appends are applied, then the connection is destroyed: the caller sees no answer. */
	dropNextAppendAnswers(n: number): void;
	/** The next n page PATCHes lose their answer: applied first (`apply`) or not at all, then the connection is destroyed. */
	dropNextPatchAnswers(n: number, options: { apply: boolean }): void;
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

/**
 * A Postgres JSONB column returns object keys shorter first, then bytewise: the
 * page the bridge reads back is not byte-identical to the blocks that were sent.
 */
function jsonbOrder(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(jsonbOrder);
	if (value === null || typeof value !== 'object') return value;
	const keys = Object.keys(value).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
	return Object.fromEntries(keys.map((key) => [key, jsonbOrder((value as Record<string, unknown>)[key])]));
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
	const pages = new Map<string, { version: number | null; content: unknown[]; title: string; archivedAt: string | null }>();
	const appendKeys = new Map<string, number>(); // `${pageId}/${key}` -> version it produced
	let dropAppendCount = 0;
	let dropPatchCount = 0;
	let dropPatchApplies = true;

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
			pages.clear();
			appendKeys.clear();
			dropAppendCount = 0;
			dropPatchCount = 0;
		},
		seedPage(pageId: string, content: unknown[], version: number | null = 1, title = 'Page'): void {
			pages.set(pageId, { version, content: [...content], title, archivedAt: null });
		},
		pageContent(pageId: string) {
			return pages.get(pageId);
		},
		dropNextAppendAnswers(n: number): void {
			dropAppendCount = n;
		},
		dropNextPatchAnswers(n: number, options: { apply: boolean }): void {
			dropPatchCount = n;
			dropPatchApplies = options.apply;
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

			// POST /api/pages/<id>/blocks: the atomic append (osionos_page_append).
			const appendMatch = method === 'POST' ? /^\/api\/pages\/([^/?]+)\/blocks$/.exec(path) : null;
			if (appendMatch) {
				if (mock.failWith) {
					response.writeHead(mock.failWith, { 'content-type': 'application/json' });
					response.end(JSON.stringify({ error: { message: 'refused' } }));
					return;
				}
				const pid = decodeURIComponent(appendMatch[1]);
				const page = pages.get(pid);
				if (!page) {
					response.writeHead(404, { 'content-type': 'application/json' });
					response.end(JSON.stringify({ error: 'not found' }));
					return;
				}
				const request_ = body as { blocks?: unknown[]; afterBlockId?: unknown; idempotencyKey?: unknown };
				const ledgerKey = `${pid}/${String(request_.idempotencyKey ?? '')}`;
				const repeated = appendKeys.get(ledgerKey);
				if (repeated === undefined) {
					const blocks = Array.isArray(request_.blocks) ? request_.blocks : [];
					const at = page.content.findIndex(
						(block) => (block as { id?: unknown })?.id === request_.afterBlockId,
					);
					const cut = at === -1 ? page.content.length : at + 1;
					page.content = [...page.content.slice(0, cut), ...blocks, ...page.content.slice(cut)];
					page.version = (page.version ?? 0) + 1;
					appendKeys.set(ledgerKey, page.version);
				}
				if (dropAppendCount > 0) {
					dropAppendCount--;
					request.socket.destroy();
					return;
				}
				const answer = (): void => {
					response.writeHead(200, { 'content-type': 'application/json' });
					response.end(JSON.stringify({ ok: true, version: repeated ?? page.version, content: page.content }));
				};
				if (mock.delayMs > 0) setTimeout(answer, mock.delayMs);
				else answer();
				return;
			}

			// GET /api/pages/<id>
			if (method === 'GET' && path.startsWith('/api/pages/')) {
				const pid = decodeURIComponent(path.slice('/api/pages/'.length));
				const seeded = pages.get(pid);
				if (seeded) {
					response.writeHead(200, { 'content-type': 'application/json' });
					// The shape of the bridge's pageRowToEntry (scripts/bridge-api.mjs): `_id`, an empty
					// title reads 'Untitled', and contentVersion is absent while the page has no version.
					response.end(JSON.stringify({
						_id: pid,
						title: seeded.title ? seeded.title : 'Untitled',
						content: jsonbOrder(seeded.content),
						archivedAt: seeded.archivedAt,
						...(seeded.version === null ? {} : { contentVersion: seeded.version }),
					}));
					return;
				}
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
				try {
					await mock.onPost?.({ path, body });
				} catch {
					response.writeHead(500, { 'content-type': 'application/json' });
					response.end(JSON.stringify({ error: { message: 'hook failed' } }));
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
				const dropped = dropPatchCount > 0;
				if (dropped) dropPatchCount--;
				if (dropped && !dropPatchApplies) {
					request.socket.destroy();
					return;
				}
				try {
					await mock.onPatch?.({ path, body });
				} catch {
					response.writeHead(500, { 'content-type': 'application/json' });
					response.end(JSON.stringify({ error: { message: 'hook failed' } }));
					return;
				}
				const stored = pages.get(path.slice('/api/pages/'.length));
				const patch = body as { baseVersion?: unknown; content?: unknown; title?: unknown; archivedAt?: unknown };
				if (stored && patch.baseVersion !== undefined && patch.baseVersion !== stored.version) {
					response.writeHead(409, { 'content-type': 'application/json' });
					response.end(JSON.stringify({ ok: false, code: 'version_conflict' }));
					return;
				}
				if (stored) {
					if (Array.isArray(patch.content)) stored.content = patch.content;
					if (typeof patch.title === 'string') stored.title = patch.title;
					if (typeof patch.archivedAt === 'string') stored.archivedAt = patch.archivedAt;
					if (stored.version !== null) stored.version += 1;
				}
				if (dropped) {
					request.socket.destroy();
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
