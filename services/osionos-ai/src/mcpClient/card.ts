import type { McpCard } from '../approvals/types.ts';

/**
 * An MCP call as the approval row stores it, and the card drawn from it (C281).
 *
 * Everything the card shows is in the row: the card is rebuilt from it, never
 * from a summary the model wrote. The row is `ai_approvals.args` of an
 * `mcp_call`, so no column was added (the brief's no-migration rule).
 */
export interface StoredMcpCall {
	serverId: string;
	serverLabel: string;
	serverHost: string;
	toolName: string;
	description: string;
	snapshotSha256: string;
	/** The arguments, exactly as they will be sent. */
	arguments: Record<string, unknown>;
}

export function disclosure(host: string): string {
	return `Page text you approve is sent to ${host}.`;
}

function text(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}

/** The stored call of a row, or null when the row is not a well-formed one. */
export function readStoredCall(args: unknown): StoredMcpCall | null {
	const row = (args ?? {}) as Record<string, unknown>;
	const serverId = text(row.serverId);
	const toolName = text(row.toolName);
	const snapshotSha256 = text(row.snapshotSha256);
	const callArgs = row.arguments;
	if (!serverId || !toolName || !snapshotSha256) return null;
	if (!callArgs || typeof callArgs !== 'object' || Array.isArray(callArgs)) return null;
	return {
		serverId,
		toolName,
		snapshotSha256,
		serverLabel: text(row.serverLabel) ?? '',
		serverHost: text(row.serverHost) ?? '',
		description: text(row.description) ?? '',
		arguments: callArgs as Record<string, unknown>,
	};
}

export function cardOf(call: StoredMcpCall): McpCard {
	return {
		serverLabel: call.serverLabel,
		serverHost: call.serverHost,
		toolName: call.toolName,
		description: call.description,
		snapshotSha256: call.snapshotSha256,
		disclosure: disclosure(call.serverHost),
	};
}
