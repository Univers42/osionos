import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import { startMockEmbedder } from './mockEmbed.ts';
import { Seeds, USER_A, USER_B, WORKSPACE_A, WORKSPACE_B } from './retrievalSeed.ts';

/**
 * The harness of the remote MCP tests: a service with the endpoint on, the
 * mock embedder, and a raw JSON-RPC client over node:http.
 *
 * node:http and not fetch, because the tests set the Host and Origin headers,
 * which a fetch client may rewrite or refuse.
 */
process.env.OSIONOS_AI_PAT = 'on';
process.env.OSIONOS_AI_PLATFORM_MODELS ??= JSON.stringify([
	{ id: 'mock-model', label: 'Mock model', inputMicroUsdPerMTok: 0, outputMicroUsdPerMTok: 0, default: true },
]);
export const embedder = await startMockEmbedder();
process.env.OSIONOS_AI_EMBED_URL = embedder.baseUrl;
process.env.OSIONOS_AI_EMBED_MODEL = 'intfloat/multilingual-e5-small';

const { createAiServer } = await import('../src/server.ts');
export const app = createAiServer();
await new Promise<void>((resolve) => {
	app.server.listen(0, '127.0.0.1', () => resolve());
});
const address = app.server.address();
export const port = address && typeof address === 'object' ? address.port : 0;
export const seeds = new Seeds(app.db);

export { USER_A, USER_B, WORKSPACE_A, WORKSPACE_B };

export interface Answer {
	status: number;
	headers: IncomingHttpHeaders;
	body: any;
	raw: string;
}

/** One raw request to the service. */
export function raw(
	method: string,
	path: string,
	options: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<Answer> {
	return new Promise((resolve, reject) => {
		const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
		const req = request(
			{ host: '127.0.0.1', port, method, path, headers: { ...(payload ? { 'content-type': 'application/json' } : {}), ...options.headers } },
			(res) => {
				let text = '';
				res.on('data', (chunk) => (text += chunk));
				res.on('end', () => {
					let body: unknown = null;
					try {
						body = text ? JSON.parse(text) : null;
					} catch {
						body = null;
					}
					resolve({ status: res.statusCode ?? 0, headers: res.headers, body, raw: text });
				});
			},
		);
		req.on('error', reject);
		if (payload) req.write(payload);
		req.end();
	});
}

/** A JSON-RPC call of the endpoint, as an outside agent sends it. */
export function rpc(
	token: string | null,
	method: string,
	params: unknown = {},
	options: { headers?: Record<string, string>; path?: string } = {},
): Promise<Answer> {
	return raw('POST', options.path ?? '/api/ai/mcp', {
		headers: {
			accept: 'application/json, text/event-stream',
			...(token ? { authorization: `Bearer ${token}` } : {}),
			...options.headers,
		},
		body: { jsonrpc: '2.0', id: 1, method, params },
	});
}

/** A tools/call, and the text it answered. */
export async function callTool(token: string, name: string, args: unknown): Promise<{ text: string; isError: boolean; answer: Answer }> {
	const answer = await rpc(token, 'tools/call', { name, arguments: args });
	assert.equal(answer.status, 200, answer.raw);
	const result = answer.body?.result;
	return { text: String(result?.content?.[0]?.text ?? ''), isError: result?.isError === true, answer };
}

/** An app session, as the bridge signs one. */
export function sessionFor(userId: string, workspaceId: string): string {
	return signAppSessionToken({
		payload: { subject: userId, provider: 'test' },
		workspace: { _id: workspaceId },
		config: { appSessionSecret: process.env.OSIONOS_APP_SESSION_SECRET ?? '', sessionTtlSeconds: 3600 },
	}).token;
}

/** A member row: the live truth the scope is intersected with. */
export async function addMember(workspaceId: string, userId: string): Promise<void> {
	await app.db.query(
		`insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions)
		 values ($1::uuid, $2::uuid, 'member', $3) on conflict do nothing`,
		[workspaceId, userId, ['read', 'update']],
	);
}

/** A token minted through the real route, from a fresh session. */
export async function mint(
	userId: string,
	workspaceIds: string[],
	scopes: string[] = ['read'],
): Promise<{ id: string; token: string }> {
	const answer = await raw('POST', '/api/ai/access-tokens', {
		headers: { authorization: `Bearer ${sessionFor(userId, workspaceIds[0] ?? WORKSPACE_A)}` },
		body: { name: 'agent', scopes, workspaceIds },
	});
	assert.equal(answer.status, 201, answer.raw);
	return { id: String(answer.body.id), token: String(answer.body.token) };
}

/** The mint window and the MCP windows start empty. */
export async function clearWindows(): Promise<void> {
	for (const pattern of ['ai:rl:pat:*', 'ai:rl:mcp:*']) {
		const keys = await app.redis.keys(pattern);
		if (keys.length > 0) await app.redis.del(...keys);
	}
}

// The servers close even when the cleanup throws: without the access-token migration the delete failed first,
// the server stayed open and the file never exited (a whole suite hung on mcpAccess.test.ts, 2026-10-23).
export async function closeAll(): Promise<void> {
	try {
		await seeds.clear();
		await app.db.query('delete from public.ai_access_tokens');
	} finally {
		await embedder.close();
		await app.close();
	}
}
