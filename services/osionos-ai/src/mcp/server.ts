import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { Pool } from 'pg';
import type { PatPrincipal } from '../pat/authenticatePat.ts';
import { MCP_INSTRUCTIONS } from './instructions.ts';
import { callTool, describeTool, toolsFor } from './tools.ts';

/**
 * The MCP server of ONE request: built for the token that was just resolved,
 * and thrown away with the request (stateless — C116). There is no session
 * to hold a credential, and nothing to outlive a revocation.
 *
 * It registers read tools only. There is no write tool to list, so a call to
 * one is an unknown tool (C115, C117).
 */
export function createMcpServer(db: Pool, principal: PatPrincipal): Server {
	const server = new Server(
		{ name: 'osionos', version: '1.0.0' },
		{ capabilities: { tools: {} }, instructions: MCP_INSTRUCTIONS },
	);
	server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: toolsFor(principal).map(describeTool) }));
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const outcome = await callTool(db, principal, request.params.name, request.params.arguments);
		if (!outcome) throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${request.params.name}`);
		return { content: [{ type: 'text' as const, text: outcome.text }], isError: outcome.isError };
	});
	return server;
}
