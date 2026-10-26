import type { Pool } from 'pg';
import type { ApprovalRow } from '../approvals/types.ts';
import { wrapOutput } from './output.ts';
import { readStoredCall } from './card.ts';
import { getOwnedWithBox, getToolNow, recordFailure, recordSuccess } from './repo.ts';
import { argsFit, redactStrings } from './schema.ts';
import { openHeader } from './secret.ts';
import { McpFailure, callServerTool } from './transport.ts';
import type { CallOptions } from './transport.ts';

/**
 * The call of an approved MCP row: the one moment the server is contacted
 * (C280).
 *
 * It runs after the claim, so a row is called once. Before anything leaves the
 * service it checks that the tool is still the one the user saw: the stored
 * hash must equal the current snapshot (C272), the tool must still be enabled,
 * the server must not be broken (C290), and the arguments must still fit the
 * schema (C277). Any of them failing is a closed door and a fixed sentence,
 * never the words of the server (C275).
 *
 * Caveat: the secret is redacted from the output by string match; a server that
 * transforms it (base64, split across lines) is not caught.
 */

export type McpCallDone =
	| { ok: true; /** The wrapped output the continuation carries. */ detail: string; summary: string }
	| { ok: false; error: string };

type Overrides = Pick<CallOptions, 'deadlineMs' | 'maxBodyBytes' | 'fetchImpl'>;

const CHANGED = 'the tool changed since the card was shown: nothing was sent';

export async function runApprovedMcpCall(db: Pool, row: ApprovalRow, overrides: Overrides = {}): Promise<McpCallDone> {
	const call = readStoredCall(row.args);
	if (!call) return { ok: false, error: 'the stored call is not readable: nothing was sent' };
	const tool = await getToolNow(db, call.serverId, row.owner_id, call.toolName);
	if (!tool || !tool.enabled) return { ok: false, error: 'the tool is not enabled any more: nothing was sent' };
	if (tool.snapshot_sha256 !== call.snapshotSha256) return { ok: false, error: CHANGED };
	if (!argsFit(tool.input_schema, call.arguments)) return { ok: false, error: 'the arguments do not fit the tool: nothing was sent' };
	const server = await getOwnedWithBox(db, call.serverId, row.owner_id);
	if (!server) return { ok: false, error: 'the server is gone: nothing was sent' };
	if (server.is_broken) return { ok: false, error: 'mcp_broken: the server failed too often, nothing was sent' };

	const started = Date.now();
	let secret = '';
	try {
		secret = openHeader(server);
		const called = await callServerTool({
			url: server.url,
			header: server.header_name && secret ? { name: server.header_name, value: secret } : undefined,
			name: call.toolName,
			arguments: call.arguments,
			...overrides,
		});
		await recordSuccess(db, server.id);
		const text = redactStrings(called.text, secret) as string;
		audit(row, call.serverId, Buffer.byteLength(text, 'utf8'), started, called.isError ? 'tool_error' : 'ok');
		const prefix = called.isError ? 'the tool reported an error. ' : '';
		return {
			ok: true,
			detail: prefix + wrapOutput(call.serverLabel, call.toolName, text, called.droppedNonText),
			summary: `the MCP tool ${call.toolName} answered (${text.length} characters)`,
		};
	} catch (error) {
		const code = error instanceof McpFailure ? error.code : 'mcp_unavailable';
		if (error instanceof McpFailure) await recordFailure(db, server.id);
		audit(row, call.serverId, 0, started, code);
		return { ok: false, error: code };
	}
}

/** One line per call: ids, the hash of the arguments, sizes and time. Never the arguments or the output. */
function audit(row: ApprovalRow, serverId: string, bytes: number, started: number, status: string): void {
	console.info(
		JSON.stringify({ event: 'mcp_call', serverId, tool: row.args?.toolName, argsSha256: row.args_sha256, bytes, ms: Date.now() - started, status }),
	);
}
