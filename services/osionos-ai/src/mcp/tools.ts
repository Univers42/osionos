import type { Pool } from 'pg';
import { z } from 'zod';
import type { PatPrincipal } from '../pat/authenticatePat.ts';
import type { AuthUser } from '../auth.ts';
import { numberSources } from '../runs/sources.ts';
import type { Authorship } from '../runs/sources.ts';
import { READ_TOOLS } from '../tools/readTools.ts';
import { TOOL_OUTPUT_CHARS } from '../tools/loop.ts';
import type { AnyReadTool, ReadToolContext } from '../tools/types.ts';
import { mcpLane } from './lane.ts';

/**
 * The tools of the remote MCP endpoint: the read tools of the assistant, from
 * the registry, run as the owner of the token inside the workspaces it names.
 *
 * Nothing here retypes a tool. The list is READ_TOOLS, the work is `tool.run`,
 * and the text is `tool.render` — with the author of every page added, because
 * an outside agent cannot be told once and for all what a page is (C119).
 */

/** The scope that opens the read tools. */
export const READ_SCOPE = 'read';

/** The owner of the token as the tools see a caller (C114, C115). */
export function patUser(principal: PatPrincipal): AuthUser {
	return {
		userId: principal.userId,
		// A token has no private workspace of its own: every workspace it reads
		// is found in the live members table, inside `scope` (C98, C115).
		workspaceId: '',
		memberWorkspaces: [],
		isAdmin: false,
		issuedAtMs: 0,
		scope: principal.workspaceIds,
	};
}

/** The context of a tool run for a token. */
export function patToolContext(db: Pool, principal: PatPrincipal): ReadToolContext {
	return { db, user: patUser(principal) };
}

/** The tools this token sees: none without the `read` scope. */
export function toolsFor(principal: PatPrincipal): readonly AnyReadTool[] {
	return principal.scopes.includes(READ_SCOPE) ? READ_TOOLS : [];
}

/** The listing of a tool, in the shape of the protocol. */
export function describeTool(tool: AnyReadTool): { name: string; description: string; inputSchema: Record<string, unknown> } {
	const { $schema: _dropped, ...schema } = z.toJSONSchema(tool.input as z.ZodType, { io: 'input' }) as Record<string, unknown>;
	return { name: tool.name, description: tool.description, inputSchema: { type: 'object', ...schema } };
}

/** The owner of each page, for the pages the tool already let through. */
async function ownersOf(db: Pool, pageIds: readonly string[]): Promise<Map<string, string | null>> {
	if (pageIds.length === 0) return new Map();
	const result = await db.query<{ id: string; owner_id: string | null }>(
		'select id, owner_id from public.osionos_pages where id = any($1::uuid[])',
		[[...new Set(pageIds)]],
	);
	return new Map(result.rows.map((row) => [String(row.id).toLowerCase(), row.owner_id ? String(row.owner_id) : null]));
}

/** What a call answers: the text, and whether it is an error. */
export interface McpToolOutcome {
	text: string;
	isError: boolean;
}

const failure = (text: string): McpToolOutcome => ({ text, isError: true });

/**
 * One tool call.
 *
 * Caveat: the author is the OWNER of the page as the row says. A collaborator
 * who edited the page is not named, so `otherAuthor: false` means "the token's
 * owner owns it", not "nobody else touched it".
 */
export async function callTool(
	db: Pool,
	principal: PatPrincipal,
	name: string,
	rawArguments: unknown,
): Promise<McpToolOutcome | null> {
	const tool = toolsFor(principal).find((candidate) => candidate.name === name);
	if (!tool) return null;
	const parsed = tool.input.safeParse(rawArguments ?? {});
	if (!parsed.success) return failure('The arguments of this call do not fit the tool.');
	const ctx = patToolContext(db, principal);
	let result;
	try {
		result = await mcpLane.run(() => tool.run(ctx, parsed.data));
	} catch {
		return failure('the tool failed');
	}
	if (result === null) return failure('Too many calls at once: try again in a moment.');
	if (!result.ok) return failure(result.error);
	const sources = tool.sources(result.data);
	const owners = await ownersOf(db, sources.map((source) => source.pageId));
	const authorOf = (pageId: string): Authorship => {
		const owner = owners.get(pageId.toLowerCase()) ?? null;
		return { authoredBy: owner ?? 'unknown', otherAuthor: owner !== principal.userId };
	};
	const { cites } = numberSources(sources, new Map(), 0);
	const text = tool.render(result.data, cites, authorOf);
	return { text: text.length > TOOL_OUTPUT_CHARS ? text.slice(0, TOOL_OUTPUT_CHARS) : text, isError: false };
}
