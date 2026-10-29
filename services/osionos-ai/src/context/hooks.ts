import type { Pool } from 'pg';
import type { ToolSet } from 'ai';
import { config } from '../config.ts';
import { mcpToolName } from '../mcpClient/runTools.ts';

/**
 * A user's hooks (U3, OSIONOS_AI_USER_HOOKS): ai_context_items rows of kind
 * 'hook' whose body lists tool names the AI may not use for that user, one
 * per line — an exact name, or a prefix ending in `*`.
 *
 * Tighten-only (C1120): a hook removes tools from a run and refuses the
 * approve of a card it names; it never adds, replaces or runs anything, and
 * it never reaches a prompt (C1129). The match is `===` or `startsWith`,
 * never a regex built from user text.
 *
 * build_plan writes pages and blocks, so a hook that blocks create_page or
 * add_blocks blocks it too (C1127).
 */

export const MAX_USER_HOOKS = 10;
export const MAX_HOOK_LINES = 32;
/** One line of a hook body; models/osionos-ai-context-hooks-migration.sql checks the same (C1124). */
export const HOOK_LINE = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}\*?$/;

const BUILD_PLAN_WRITES = ['create_page', 'add_blocks'];

/** Why a hook body is refused, or null: 1 to 32 lines, each a pattern, no empty line. */
export function hookProblem(body: string): 'hook_pattern' | null {
	const lines = body.split('\n');
	if (lines.length > MAX_HOOK_LINES) return 'hook_pattern';
	return lines.every((line) => HOOK_LINE.test(line)) ? null : 'hook_pattern';
}

function matches(name: string, pattern: string): boolean {
	return pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern;
}

/** Whether one of `names` (the names a tool goes by) is blocked by a pattern. */
export function isBlocked(names: readonly string[], patterns: readonly string[]): boolean {
	const all = names.includes('build_plan') ? [...names, ...BUILD_PLAN_WRITES] : names;
	return all.some((name) => patterns.some((pattern) => matches(name, pattern)));
}

const MCP_MODEL_NAME = /^mcp_[0-9a-f]{8}_/;

/**
 * The tools minus every blocked one: the same objects, never a new key (C1120).
 * An MCP tool also goes by `mcp_call`, the name of its card, so one hook
 * blocks it on both sides.
 */
export function dropBlockedTools(tools: ToolSet, patterns: readonly string[]): ToolSet {
	if (patterns.length === 0) return tools;
	const kept: ToolSet = {};
	for (const [name, tool] of Object.entries(tools)) {
		const names = MCP_MODEL_NAME.test(name) ? [name, 'mcp_call'] : [name];
		if (!isBlocked(names, patterns)) kept[name] = tool;
	}
	return kept;
}

/** The patterns of a user's active hooks. Its own query: no LIMIT shared with the prompt's kinds (C1129). */
export async function loadHookPatterns(db: Pool, userId: string): Promise<string[]> {
	const result = await db.query<{ body: string }>(
		`select body from public.ai_context_items
		 where scope = 'user' and owner_id = $1 and kind = 'hook' and archived_at is null
		 order by slug limit ${MAX_USER_HOOKS}`,
		[userId],
	);
	return result.rows.flatMap((row) => row.body.split('\n'));
}

/**
 * Why a write by a tool going by `names` is refused for this user, or null
 * (C1125, C1126): a read that fails is a 503, never a pass. Flag off: no query.
 */
export async function hookRefusal(
	db: Pool,
	userId: string,
	names: readonly string[],
): Promise<{ status: 403 | 503; code: 'blocked_by_hook' | 'hooks_unavailable' } | null> {
	if (!config.userHooksEnabled) return null;
	let patterns: string[];
	try {
		patterns = await loadHookPatterns(db, userId);
	} catch (error) {
		console.warn(JSON.stringify({ event: 'user_hooks_unavailable', code: (error as Error).name }));
		return { status: 503, code: 'hooks_unavailable' };
	}
	return isBlocked(names, patterns) ? { status: 403, code: 'blocked_by_hook' } : null;
}

/** The hooks of a run: none (flag off, no query), the patterns, or unreadable. */
export type RunHooks = { kind: 'patterns'; patterns: string[] } | { kind: 'unavailable' };

/**
 * The hooks of a run, read once before it. A failed read fails CLOSED (C1122):
 * the run gets no tools at all and still answers in text.
 */
export async function hooksForRun(db: Pool, userId: string | undefined): Promise<RunHooks | undefined> {
	if (!config.userHooksEnabled || !userId) return undefined;
	try {
		return { kind: 'patterns', patterns: await loadHookPatterns(db, userId) };
	} catch (error) {
		console.warn(JSON.stringify({ event: 'user_hooks_unavailable', code: (error as Error).name }));
		return { kind: 'unavailable' };
	}
}

/**
 * The names an approval row goes by: its tool, and for an MCP call the name
 * the model called (stored since U3) and the base name derived from the
 * server and tool (rows written before U3, C1123).
 */
export function approvalToolNames(row: { tool: string; args: unknown }): string[] {
	if (row.tool !== 'mcp_call') return [row.tool];
	const args = (row.args ?? {}) as Record<string, unknown>;
	const names = ['mcp_call'];
	if (typeof args.modelName === 'string') names.push(args.modelName);
	if (typeof args.serverId === 'string' && typeof args.toolName === 'string') names.push(mcpToolName(args.serverId, args.toolName, new Set()));
	return names;
}
