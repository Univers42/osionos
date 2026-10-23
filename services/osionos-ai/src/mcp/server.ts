import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import type { PatPrincipal } from '../pat/authenticatePat.ts';
import { MCP_INSTRUCTIONS } from './instructions.ts';
import { callTool, describeTool, toolsFor } from './tools.ts';

/**
 * The MCP server of ONE request: built for the token that was just resolved,
 * and thrown away with the request (stateless — C116). There is no session
 * to hold a credential, and nothing to outlive a revocation.
 *
 * The listing follows the scopes of the token: the reads with `read`, the
 * three write tools with `write_approval`. A write tool only proposes an
 * approval; the user decides it in osionos (C117). There is no `build_plan`
 * and no content write.
 */
export function createMcpServer(db: Pool, redis: Redis, principal: PatPrincipal): Server {
	const server = new Server(
		{ name: 'osionos', version: '1.0.0' },
		{ capabilities: { tools: {} }, instructions: MCP_INSTRUCTIONS },
	);
	server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: toolsFor(principal).map(describeTool) }));
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const outcome = await callTool(db, redis, principal, request.params.name, request.params.arguments);
		if (!outcome) throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${request.params.name}`);
		return { content: [{ type: 'text' as const, text: outcome.text }], isError: outcome.isError };
	});
	return server;
}
