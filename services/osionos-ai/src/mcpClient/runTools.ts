import type { Pool } from 'pg';
import { listEnabledTools } from './repo.ts';

/**
 * The MCP tools of a run, as the model names them (C265, C266).
 *
 * The name is `mcp_<first 8 of the server id>_<tool>`: it comes from the row
 * id and the tool, never from the label the user typed, so two servers with
 * the same label stay apart and a server tool named `search_pages` can never
 * be the built-in one. It matches `^[a-zA-Z0-9_-]{1,64}$`, the shape model
 * APIs accept.
 */

export interface McpToolEntry {
	/** The name the model calls. */
	modelName: string;
	serverId: string;
	serverLabel: string;
	serverHost: string;
	/** The name the server knows. */
	toolName: string;
	description: string;
	inputSchema: Record<string, unknown>;
	/** The hash of the words the user agreed to (C272). */
	sha256: string;
}

const MAX_MODEL_NAME = 64;

/** A name the model APIs accept, unique in `taken`. */
export function mcpToolName(serverId: string, toolName: string, taken: Set<string>): string {
	const prefix = `mcp_${serverId.replaceAll('-', '').slice(0, 8)}_`;
	const base = (prefix + toolName.replace(/[^a-zA-Z0-9_-]/gu, '_')).slice(0, MAX_MODEL_NAME);
	let name = base;
	for (let index = 2; taken.has(name); index++) {
		const suffix = `_${index}`;
		name = base.slice(0, MAX_MODEL_NAME - suffix.length) + suffix;
	}
	taken.add(name);
	return name;
}

/** The host a server is reached at: what the user is told their text is sent to. */
export function hostOf(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return '';
	}
}

/** The enabled tools of a user, named for the model. Empty when there are none. */
export async function loadMcpTools(db: Pool, ownerId: string): Promise<McpToolEntry[]> {
	const taken = new Set<string>();
	return (await listEnabledTools(db, ownerId)).map((row) => ({
		modelName: mcpToolName(row.server_id, row.name, taken),
		serverId: row.server_id,
		serverLabel: row.label,
		serverHost: hostOf(row.url),
		toolName: row.name,
		description: row.description,
		inputSchema: row.input_schema,
		sha256: row.snapshot_sha256,
	}));
}

/**
 * The characters the definitions of these tools add to every step (C287).
 *
 * Caveat: JSON length of name, description and schema, as the existing count
 * does for the built-ins; a provider that serialises tools more verbosely is
 * under-counted, and the settlement corrects the bill, not the reservation.
 */
export function mcpToolChars(tools: readonly McpToolEntry[]): number {
	return tools.reduce(
		(sum, tool) =>
			sum +
			JSON.stringify({
				type: 'function',
				function: { name: tool.modelName, description: tool.description, parameters: tool.inputSchema },
			}).length,
		0,
	);
}
