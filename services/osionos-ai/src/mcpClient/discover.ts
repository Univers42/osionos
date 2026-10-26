import { httpError } from '../http.ts';
import { McpFailure, listServerTools } from './transport.ts';
import type { ListOptions } from './transport.ts';
import { MAX_TOOLS, screenTools } from './schema.ts';
import { openHeader } from './secret.ts';
import { applySnapshot, recordFailure } from './repo.ts';
import type { ServerWithBox, ToolRow } from './repo.ts';
import type { Pool } from 'pg';

/**
 * One discovery: connect, list, screen, store (C276, C277, C290).
 *
 * The breaker is in the database: three failures in a row put `broken_until`
 * five minutes ahead, and while it is ahead no request leaves the service.
 * A list above 50 tools is the server's shape, not a fault of the network, so
 * it is refused without counting toward the breaker.
 */

export interface Discovered {
	tools: ToolRow[];
	/** Tools the server listed that broke a cap and were left out. */
	refused: number;
}

export type DiscoverOverrides = Pick<ListOptions, 'deadlineMs' | 'fetchImpl' | 'maxBodyBytes' | 'maxPages'>;

export async function discoverServer(
	db: Pool,
	server: ServerWithBox,
	overrides: DiscoverOverrides = {},
): Promise<Discovered> {
	if (server.is_broken) throw httpError(409, 'mcp_broken');
	const secret = openHeader(server);
	let raw;
	try {
		raw = await listServerTools({
			url: server.url,
			header: server.header_name && secret ? { name: server.header_name, value: secret } : undefined,
			...overrides,
		});
	} catch (error) {
		await recordFailure(db, server.id);
		throw error;
	}
	if (raw.length > MAX_TOOLS) throw new McpFailure('mcp_too_large');
	const screened = screenTools(raw, secret);
	const tools = await applySnapshot(db, server.id, screened.tools);
	return { tools, refused: screened.refused };
}
