import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { config } from '../config.ts';
import type { PatPrincipal } from '../pat/authenticatePat.ts';
import type { AuthUser } from '../auth.ts';
import { proposeWrite } from '../approvals/propose.ts';
import { countPendingForToken } from '../approvals/repo.ts';
import { checkRateLimit, MCP_WRITE_LIMIT_PREFIX } from '../rateLimit.ts';
import { numberSources } from '../runs/sources.ts';
import type { Authorship } from '../runs/sources.ts';
import { READ_TOOLS } from '../tools/readTools.ts';
import { WRITE_TOOLS } from '../tools/writeTools.ts';
import { TOOL_OUTPUT_CHARS } from '../tools/loop.ts';
import type { AnyReadTool, AnyWriteTool, ReadToolContext } from '../tools/types.ts';
import { mcpLane } from './lane.ts';

/**
 * The tools of the remote MCP endpoint: the read tools of the assistant, from
 * the registry, run as the owner of the token inside the workspaces it names,
 * and — with the `write_approval` scope — the write tools, which only ASK.
 *
 * Nothing here retypes a tool. The reads are READ_TOOLS, the work is
 * `tool.run`, and the text is `tool.render` — with the author of every page
 * added, because an outside agent cannot be told once and for all what a page
 * is (C119).
 *
 * A write is an approval the user decides in osionos (C117): the tool builds
 * its plan, `proposeWrite` stores the question, and the bridge is never called.
 * Nothing here holds an app-session token, and nothing here writes.
 */

/** The scope that opens the read tools. */
export const READ_SCOPE = 'read';

/** The scope that lets an outside agent PROPOSE writes (the user still decides). */
export const WRITE_SCOPE = 'write_approval';

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

/** A tool the endpoint serves: a read, or a write that only asks. */
export type McpTool = AnyReadTool | AnyWriteTool;

/**
 * The tools this token sees: the reads with `read`, the writes with
 * `write_approval`. Never `build_plan`. Content is only ever added, through the
 * bridge's atomic append (`add_blocks`, C226); a rewrite of existing text stays
 * out until C227.
 */
export function toolsFor(principal: PatPrincipal): readonly McpTool[] {
	const tools: McpTool[] = [];
	if (principal.scopes.includes(READ_SCOPE)) tools.push(...READ_TOOLS);
	if (principal.scopes.includes(WRITE_SCOPE)) tools.push(...WRITE_TOOLS);
	return tools;
}

/** The listing of a tool, in the shape of the protocol. */
export function describeTool(tool: McpTool): { name: string; description: string; inputSchema: Record<string, unknown> } {
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
 * One write call: the two limits, then the proposal, and never a write.
 *
 * The limits are checked BEFORE the insert: the pending approvals of the token
 * and its minute window. Over either, the answer is an error and no row is
 * written. The proposal itself runs in the same lane as the reads.
 *
 * Caveat: the pending count and the insert are two statements, so calls racing
 * on one token can pass the cap together; the minute window bounds the
 * overshoot to `mcpWritesPerMinute`. An exact cap needs a lock on the token row.
 */
async function callWriteTool(
	db: Pool,
	redis: Redis,
	principal: PatPrincipal,
	tool: AnyWriteTool,
	rawArguments: unknown,
): Promise<McpToolOutcome> {
	const parsed = tool.input.safeParse(rawArguments ?? {});
	if (!parsed.success) return failure('The arguments of this call do not fit the tool.');
	const ctx = patToolContext(db, principal);
	const outcome = await mcpLane.run<McpToolOutcome>(async () => {
		const waiting = await countPendingForToken(db, principal.tokenId);
		if (waiting >= config.mcpPendingPerToken) {
			return failure(
				`This token already has ${waiting} writes waiting for the user: nothing new is asked until they decide.`,
			);
		}
		const rate = await checkRateLimit(
			redis,
			principal.tokenId,
			config.mcpWritesPerMinute,
			new Date(),
			MCP_WRITE_LIMIT_PREFIX,
		);
		if (!rate.allowed) {
			return failure('This token has asked for too many writes this minute: try again shortly.');
		}
		const result = await proposeWrite(ctx, tool, parsed.data, {
			kind: 'mcp',
			tokenId: principal.tokenId,
			ownerId: principal.userId,
		});
		if (!result.ok) return failure(result.message);
		// A text result, not an error: the call did its job, and the write has
		// not happened. The user decides in osionos.
		return {
			text: `Approval ${result.row.id} is waiting: the user must approve it in osionos. Nothing has been written yet.`,
			isError: false,
		};
	});
	if (outcome === null) return failure('Too many calls at once: try again in a moment.');
	return outcome;
}

/**
 * One tool call.
 *
 * Unknown means the token has no such tool: a read-only token calling a write
 * tool gets the same answer as a call to a name that does not exist (C115).
 *
 * Caveat: the author is the OWNER of the page as the row says. A collaborator
 * who edited the page is not named, so `otherAuthor: false` means "the token's
 * owner owns it", not "nobody else touched it".
 */
export async function callTool(
	db: Pool,
	redis: Redis,
	principal: PatPrincipal,
	name: string,
	rawArguments: unknown,
): Promise<McpToolOutcome | null> {
	const tool = toolsFor(principal).find((candidate) => candidate.name === name);
	if (!tool) return null;
	if (tool.kind === 'write') return callWriteTool(db, redis, principal, tool, rawArguments);
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
