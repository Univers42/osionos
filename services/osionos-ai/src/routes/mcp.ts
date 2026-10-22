import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { config } from '../config.ts';
import { readJson } from '../http.ts';
import { guardRefusal, sendMcpError } from '../mcp/guard.ts';
import { createMcpServer } from '../mcp/server.ts';
import { authenticatePat } from '../pat/authenticatePat.ts';
import { checkMcpRateLimit } from '../rateLimit.ts';
import type { RouteContext } from './types.ts';

/**
 * POST /api/ai/mcp: the remote MCP endpoint (G4b-1, read only).
 *
 * The order of the refusals is the order of the rules:
 *   1. host and origin (C118), before anything reads the token;
 *   2. the method: stateless, so only POST (C116);
 *   3. the personal access token, resolved on THIS request (C114, C116) —
 *      an app session is not one, and a token in the query string is not
 *      read at all (C112);
 *   4. the rate limit, on the token and on its owner (C118).
 *
 * Every answer here goes through `sendMcpError` or the SDK: none carries an
 * `access-control-allow-*` header. The route never mints an app session and
 * holds no shared secret (C120).
 */

/** A body is any JSON: the protocol decides what it means. */
const anyJson = z.unknown();

export async function handleMcp(ctx: RouteContext): Promise<number> {
	const { request, response } = ctx;
	const refusal = guardRefusal(request, config.mcpAllowedHosts, config.mcpAllowedOrigins);
	if (refusal) {
		sendMcpError(response, 403, refusal);
		return 403;
	}
	if (request.method !== 'POST') {
		sendMcpError(response, 405, 'method_not_allowed', { allow: 'POST' });
		return 405;
	}
	const principal = await authenticatePat(ctx.deps.db, request);
	if (!principal) {
		sendMcpError(response, 401, 'unauthorized', { 'www-authenticate': 'Bearer' });
		return 401;
	}
	const rate = await checkMcpRateLimit(ctx.deps.redis, principal.tokenId, principal.userId);
	if (!rate.allowed) {
		sendMcpError(response, 429, 'rate_limited', { 'retry-after': String(rate.retryAfterSeconds) });
		return 429;
	}
	let body: unknown;
	try {
		body = await readJson(request, anyJson);
	} catch (error) {
		const status = (error as { status?: unknown }).status;
		const code = (error as { code?: unknown }).code;
		const httpStatus = typeof status === 'number' ? status : 400;
		sendMcpError(response, httpStatus, typeof code === 'string' ? code : 'invalid_request');
		return httpStatus;
	}
	const server = createMcpServer(ctx.deps.db, principal);
	// The guard above already decided; the transport checks the same two
	// headers again, so a later change of one cannot open the other (C118).
	const transport = new StreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
		enableDnsRebindingProtection: true,
		allowedHosts: [String(request.headers.host)],
		allowedOrigins: [...config.mcpAllowedOrigins],
	});
	response.on('close', () => {
		void transport.close();
		void server.close();
	});
	await server.connect(transport);
	await transport.handleRequest(request, response, body);
	return response.statusCode;
}
