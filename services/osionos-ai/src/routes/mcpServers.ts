import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../auth.ts';
import { kekAvailable } from '../connections/crypto.ts';
import { readJson, sendError, sendJson, sendNoContent } from '../http.ts';
import { discoverServer } from '../mcpClient/discover.ts';
import {
	deleteOwned,
	getOwned,
	getOwnedWithBox,
	insertServer,
	listServers,
	patchServer,
	setToolEnabled,
} from '../mcpClient/repo.ts';
import type { NewServer, ServerRow, ToolRow } from '../mcpClient/repo.ts';
import { sealHeader } from '../mcpClient/secret.ts';
import { McpFailure } from '../mcpClient/transport.ts';
import type { McpFailureCode } from '../mcpClient/transport.ts';
import { checkServerUrl, createBodySchema, parseHeader, patchBodySchema, toolBodySchema } from '../mcpClient/validate.ts';
import type { Header } from '../mcpClient/validate.ts';
import { MCP_DISCOVER_LIMIT_PREFIX, checkRateLimit } from '../rateLimit.ts';
import { isFreshSession, requireUser, UUID } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The MCP servers of the user: register one, change it, discover its tools,
 * choose which tools stay on (E1a, behind OSIONOS_AI_MCP_CLIENT).
 *
 * Nothing here gives a tool to a run. A server of somebody else is the same
 * 404 as a missing one (C289), and no answer carries a box, a ciphertext or
 * the query of a URL (C271).
 */

/** The servers of a user (C276). */
const MAX_SERVERS = 10;
/** Registering a server hands the service a credential: the session must be new (C289). */
const FRESH_WINDOW_MS = 10 * 60 * 1000;
/** Discoveries of a user in a minute: each is an outbound call (C289). */
const DISCOVERIES_PER_MINUTE = 6;

/** The status of each fixed failure code. */
const FAILURE_STATUS: Record<McpFailureCode, number> = {
	mcp_unreachable: 502,
	mcp_protocol: 502,
	mcp_too_large: 502,
	mcp_timeout: 504,
};

/** The shape the Hub reads: the host, never the URL, and never a box. */
function present(row: ServerRow, tools: ToolRow[]) {
	return {
		id: row.id,
		label: row.label,
		host: new URL(row.url).host,
		status: row.status,
		headerName: row.header_name,
		headerLast4: row.header_last4,
		tools: tools.map((tool) => ({ name: tool.name, description: tool.description, enabled: tool.enabled })),
	};
}

function notFound(ctx: RouteContext): number {
	sendError(ctx.response, 404, 'not_found');
	return 404;
}

function refuse(ctx: RouteContext, status: number, code: string): number {
	sendError(ctx.response, status, code);
	return status;
}

/** The server as the list shows it, after a write. */
async function presentOwned(ctx: RouteContext, user: AuthUser, id: string) {
	const { servers, tools } = await listServers(ctx.deps.db, user.userId);
	const row = servers.find((server) => server.id === id);
	return row ? present(row, tools.filter((tool) => tool.server_id === id)) : null;
}

function sealed(id: string, ownerId: string, header: Header | null): NewServer['header'] {
	if (!header) return null;
	const box = sealHeader(id, ownerId, header.value);
	return {
		name: header.name,
		last4: header.value.slice(-4),
		box: box.secretBox,
		wrappedDek: box.wrappedDek,
		kekId: box.kekId,
	};
}

/** GET and POST /api/ai/mcp-servers */
export async function handleMcpServers(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	if (ctx.request.method === 'GET') {
		const { servers, tools } = await listServers(ctx.deps.db, user.userId);
		sendJson(ctx.response, 200, {
			servers: servers.map((row) => present(row, tools.filter((tool) => tool.server_id === row.id))),
		});
		return 200;
	}
	if (ctx.request.method !== 'POST') return refuse(ctx, 405, 'method_not_allowed');
	if (!isFreshSession(user, FRESH_WINDOW_MS)) return refuse(ctx, 403, 'reauth_required');
	// Without a KEK a header cannot be sealed, and a server without one is
	// not worth a half-working route: 503, always, as the connections do.
	if (!kekAvailable()) return refuse(ctx, 503, 'connections_unavailable');
	const body = await readJson(ctx.request, createBodySchema);
	const url = checkServerUrl(body.url);
	const header = parseHeader(body.headerName, body.headerValue);
	const id = randomUUID();
	const row = await insertServer(
		ctx.deps.db,
		{ id, ownerId: user.userId, label: body.label, url, header: sealed(id, user.userId, header) },
		MAX_SERVERS,
	);
	if (!row) return refuse(ctx, 409, 'too_many_servers');
	sendJson(ctx.response, 201, present(row, []));
	return 201;
}

/** PATCH and DELETE /api/ai/mcp-servers/:id */
export async function handleMcpServerItem(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const id = ctx.params[0] ?? '';
	if (!UUID.test(id)) return notFound(ctx);
	if (ctx.request.method === 'DELETE') {
		if (!(await deleteOwned(ctx.deps.db, id, user.userId))) return notFound(ctx);
		sendNoContent(ctx.response);
		return 204;
	}
	if (!isFreshSession(user, FRESH_WINDOW_MS)) return refuse(ctx, 403, 'reauth_required');
	const body = await readJson(ctx.request, patchBodySchema);
	const current = await getOwned(ctx.deps.db, id, user.userId);
	if (!current) return notFound(ctx);
	let url: string | undefined;
	let header: NewServer['header'] | undefined;
	if (body.url !== undefined || body.headerValue !== undefined) {
		// A new host must not inherit the credential of the old one (C270):
		// the url and the header travel together, or the request is refused.
		if (body.url === undefined || body.headerValue === undefined) return refuse(ctx, 400, 'invalid_request');
		if (!kekAvailable()) return refuse(ctx, 503, 'connections_unavailable');
		url = checkServerUrl(body.url);
		header = sealed(id, user.userId, parseHeader(body.headerName, body.headerValue, current.header_name ?? 'Authorization'));
	}
	await patchServer(ctx.deps.db, id, user.userId, { label: body.label, url, header });
	sendJson(ctx.response, 200, await presentOwned(ctx, user, id));
	return 200;
}

/** POST /api/ai/mcp-servers/:id/discover */
export async function handleMcpDiscover(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const id = ctx.params[0] ?? '';
	if (!UUID.test(id)) return notFound(ctx);
	const server = await getOwnedWithBox(ctx.deps.db, id, user.userId);
	if (!server) return notFound(ctx);
	// After the owner check: a stranger learns nothing from the limiter.
	const rate = await checkRateLimit(ctx.deps.redis, user.userId, DISCOVERIES_PER_MINUTE, new Date(), MCP_DISCOVER_LIMIT_PREFIX);
	if (!rate.allowed) return refuse(ctx, 429, 'rate_limited');
	if (server.header_ciphertext && !kekAvailable()) return refuse(ctx, 503, 'connections_unavailable');
	try {
		const found = await discoverServer(ctx.deps.db, server);
		sendJson(ctx.response, 200, {
			tools: found.tools.map((tool) => ({ name: tool.name, description: tool.description, enabled: tool.enabled })),
			refused: found.refused,
		});
		return 200;
	} catch (error) {
		if (error instanceof McpFailure) return refuse(ctx, FAILURE_STATUS[error.code], error.code);
		throw error;
	}
}

/** PATCH /api/ai/mcp-servers/:id/tools/:name */
export async function handleMcpTool(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const id = ctx.params[0] ?? '';
	let name: string;
	try {
		name = decodeURIComponent(ctx.params[1] ?? '');
	} catch {
		return notFound(ctx);
	}
	if (!UUID.test(id) || !name) return notFound(ctx);
	const body = await readJson(ctx.request, toolBodySchema);
	if (!(await setToolEnabled(ctx.deps.db, id, user.userId, name, body.enabled))) return notFound(ctx);
	sendJson(ctx.response, 200, { name, enabled: body.enabled });
	return 200;
}
