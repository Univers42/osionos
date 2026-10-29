import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import type { ToolSet } from 'ai';
import { config } from '../config.ts';
import type { AuthUser } from '../auth.ts';
import { canAccessWorkspaceLive } from '../workspaceAccess.ts';
import { toolDefinitionChars } from '../tools/index.ts';
import type { ToolHooks, ToolPool } from '../tools/index.ts';
import { UrlProvenance } from './provenance.ts';
import { WorkspaceTextLedger } from './queryGuard.ts';
import { readWorkspaceWeb } from './settings.ts';
import { webToolDefinitions } from './tools.ts';
import type { WebRun, WebTaint } from './tools.ts';

/**
 * The web of ONE run: whether it gets the tools, and the state they share.
 *
 * Three layers enable the tools (C355): the flag, the workspace switch, the
 * toggle of THIS message. Any layer off and the tools are absent from the
 * request, never refused. An agent never gets them in v1 (C369).
 */

/** Whether this run offers web_search and web_fetch. */
export async function webOnForRun(
	db: Pool,
	input: { asked?: boolean; user?: AuthUser; agentful: boolean; workspaceId?: string },
): Promise<boolean> {
	if (!config.webEnabled || input.asked !== true || !input.user || input.agentful || !input.workspaceId) return false;
	if (!(await canAccessWorkspaceLive(db, input.user, input.workspaceId, 'read'))) return false;
	return readWorkspaceWeb(db, input.workspaceId);
}

/** The characters the two definitions add to every step's prompt (C365): zero when the run has no web. */
export function webToolChars(webOn: boolean): number {
	return webOn ? toolDefinitionChars(webToolDefinitions(Boolean(config.searxngUrl))) : 0;
}

/**
 * The state the web tools of a run share.
 *
 * `typed` is the text the human typed for THIS run: its URLs are the only
 * ones the run starts with (C349). `read` is the workspace text the prompt
 * already carries (pages, sources, files, memories); tool outputs join it as
 * the run reads (C356).
 */
export function newWebRun(input: {
	db: Pool;
	redis: Redis;
	runId: string;
	userId: string;
	conversationId: string;
	taint: WebTaint;
	typed: string;
	read: readonly string[];
	caps?: { searches: number; fetches: number };
}): WebRun {
	const provenance = new UrlProvenance();
	provenance.addTyped(input.typed);
	const ledger = new WorkspaceTextLedger();
	for (const text of input.read) ledger.add(text);
	return {
		db: input.db,
		redis: input.redis,
		runId: input.runId,
		userId: input.userId,
		conversationId: input.conversationId,
		provenance,
		ledger,
		taint: input.taint,
		counters: { searches: 0, fetches: 0, bytes: 0 },
		...(input.caps ? { caps: input.caps } : {}),
		...(config.searxngUrl ? { searxngUrl: config.searxngUrl } : {}),
	};
}

/** The sentence a guarded tool answers while the conversation is tainted. */
export const TAINTED_REFUSAL =
	'This conversation has read web content, so this tool is off in it. Start a new conversation to use it.';

/**
 * The tools a web page must never reach: memory, skills, bulk plans, third-party
 * servers (C359), and the list of the user's own context (U5).
 */
function isGuarded(name: string): boolean {
	return name === 'remember' || name === 'load_skill' || name === 'list_my_context' || name === 'build_plan' || name.startsWith('mcp_');
}

/**
 * The tool set with the guarded tools refusing while the conversation is
 * tainted. The check runs at CALL time: a search in this step taints the
 * conversation before the next call reads the flag.
 */
export function guardTainted(tools: ToolSet, taint: WebTaint, hooks: ToolHooks, pool: ToolPool): ToolSet {
	const guarded: ToolSet = {};
	for (const [name, tool] of Object.entries(tools)) {
		const execute = tool.execute;
		if (!isGuarded(name) || !execute) {
			guarded[name] = tool;
			continue;
		}
		guarded[name] = {
			...tool,
			execute: async (input: unknown, options: Parameters<typeof execute>[1]) => {
				if (!taint.tainted) return execute(input, options);
				await hooks.onResult?.({ toolCallId: options.toolCallId, toolName: name, ok: false, error: 'web_tainted' });
				return pool.draw(TAINTED_REFUSAL);
			},
		} as typeof tool;
	}
	return guarded;
}
