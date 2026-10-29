import type { Pool } from 'pg';
import type { ToolSet } from 'ai';
import { config } from '../config.ts';
import { rememberTool } from '../tools/memoryTools.ts';
import { loadSkillTool } from '../tools/skillTools.ts';
import type { WorkspaceSkillLoader } from '../tools/skillTools.ts';
import { buildSkillIndex } from '../skills/runSkills.ts';
import type { SkillIndex, SkillIndexEntry } from '../skills/runSkills.ts';
import { loadListedVersion, recordSkillPin } from '../skills/repo.ts';
import { loadUserSkillBody } from '../context/repo.ts';
import { readToolSet } from '../tools/index.ts';
import { VIEW_TOOLS } from '../tools/viewTools.ts';
import type { ToolOutcome, ToolPool } from '../tools/index.ts';
import { writeToolSet } from '../approvals/toolSet.ts';
import { mcpToolSet } from '../mcpClient/propose.ts';
import type { McpToolEntry } from '../mcpClient/runTools.ts';
import type { Redis } from 'ioredis';
import type { ApprovalContext, PermissionAsked } from '../approvals/types.ts';
import type { RetrievedChunk } from '../retrieval/search.ts';
import type { AuthUser } from '../auth.ts';
import type { PageContext } from './prompt.ts';
import { citationData } from './sources.ts';
import { cardAgentOf } from '../agents/card.ts';
import { isCustomAgent } from '../agents/config.ts';
import type { AgentConfig } from '../agents/config.ts';
import { webTools } from '../web/tools.ts';
import type { WebRun, WebTaint } from '../web/tools.ts';
import { guardTainted } from '../web/runWeb.ts';
import { dropBlockedTools } from '../context/hooks.ts';
import type { RunHooks } from '../context/hooks.ts';
import { listMyContextTool } from '../context/listTool.ts';

/**
 * The tools of a run.
 *
 * The reads come first: the search of a workspace, and the read of a page.
 * They read the workspace of the caller, and they carry NO token: a read tool
 * has no use for one.
 *
 * The WRITES come after, when the bridge is configured: they ask the user for
 * the right to write, and they write nothing. Without a bridge URL they are
 * not registered at all, and the reads keep working.
 *
 * The tool set knows three things about the run: the sources it found (they
 * are the citations of the answer), the pages it read or quoted (they are the
 * provenance of an approval), and whether it asked the user (that is the
 * finish reason of the run).
 */

/** What the tools of a run tell the run. */
export interface RunTools {
	/** The tools the model may call, or nothing when the run has no caller. */
	tools: ToolSet | undefined;
	/** The sources of the run: the ones of the prompt, then the ones the tools found. */
	readonly cited: RetrievedChunk[];
	/** Whether the run asked the user for the right to write. */
	awaitingApproval: boolean;
	/**
	 * The writes the run asked for: one card each.
	 *
	 * The approval id is what a client keeps: the card is drawn again from it
	 * when the stream of the run is gone.
	 */
	readonly permissions: readonly PermissionAsked[];
}

/** The tools of a run, and what they know of it. */
export function buildRunTools(input: {
	db: Pool;
	user?: AuthUser;
	pool: ToolPool;
	runId: string;
	conversationId: string;
	ownerId: string;
	/** The pages the client quoted: the run reads them in its prompt. */
	pages: readonly PageContext[];
	/** The sources of the prompt: they are cited before the first word. */
	sources: readonly RetrievedChunk[];
	/**
	 * The agent of the run, or none.
	 *
	 * None is the general assistant: every tool of the runtime, as today. An
	 * agent narrows them to its own list — it never gains one, and the write
	 * tools it keeps stay behind the approval of the user.
	 */
	agent?: AgentConfig | null;
	/**
	 * The skills the prompt of the run lists, and the workspace they come from.
	 *
	 * `load_skill` answers for exactly these ids. Without it the index is the
	 * agent's built-ins, as before workspace skills existed.
	 */
	skillIndex?: SkillIndex;
	workspaceId?: string;
	/**
	 * The user's own skills the user turn lists (U1, OSIONOS_AI_USER_CONTEXT).
	 * Absent is the run of today.
	 */
	userSkills?: readonly SkillIndexEntry[];
	/** The context item ids the prompt of the run carries (U5: `list_my_context` says which). */
	promptItemIds?: ReadonlySet<string>;
	/**
	 * The MCP tools of the caller, loaded before the run (C265).
	 *
	 * Empty or absent is the run of today: not one key is added.
	 */
	mcp?: { tools: readonly McpToolEntry[]; redis: Redis };
	/**
	 * The web tools of the run (C355): present only when every layer is on.
	 * Absent is the run of today: not one key is added.
	 */
	web?: WebRun;
	/**
	 * The web taint of the conversation, while OSIONOS_AI_WEB is on (C359):
	 * the guarded tools refuse once it is set, even by a call of this run.
	 * The web run, when there is one, shares this object.
	 */
	webTaint?: WebTaint;
	/**
	 * A research run (C398): the set is exactly the four reading tools,
	 * absent rather than refused. Writes, memory, skills, MCP and the view
	 * tools are not in the request at all.
	 */
	research?: boolean;
	/**
	 * The user's hooks (U3): the tools they name leave the set LAST, after every
	 * other narrowing, so no step can add one back. Unreadable: no tools at all.
	 */
	hooks?: RunHooks;
	/** The event of the run. */
	emit: (type: string, data: unknown) => Promise<void>;
}): RunTools {
	const { db, user, pool, runId, conversationId, ownerId, pages, sources, emit } = input;
	const agent = input.agent ?? null;
	const skillIndex = input.skillIndex ?? buildSkillIndex(agent?.skills ?? [], []);
	const cited: RetrievedChunk[] = [...sources];
	const permissions: PermissionAsked[] = [];
	const run: RunTools = { tools: undefined, cited, awaitingApproval: false, permissions };

	const hooks = {
		citedSources: sources,
		onSources: async (
			found: readonly { n: number; source: RetrievedChunk }[],
			toolCallId: string,
		) => {
			// Pushed before the first await: the calls of a step interleave at
			// the awaits, and the list must stay in the order of the numbers
			// (the stored part of a source is its number minus one).
			cited.push(...found.map(({ source }) => source));
			for (const { n, source } of found) {
				await emit('citation', {
					...citationData(source, n),
					// The call that found the passage: the client credits
					// it to that call, and to no other.
					toolCallId,
				});
			}
		},
		onResult: async (outcome: ToolOutcome) => {
			await emit('tool.result', outcome);
			// C42: a proposal is announced so a client can show the chip.
			if (outcome.memoryId && outcome.memoryBody) {
				await emit('memory.proposed', { type: 'memory.proposed', id: outcome.memoryId, body: outcome.memoryBody });
			}
			// The skill a load returned is pinned on the row of the run (C40):
			// the stream expires, the row does not.
			if (outcome.skill) await recordSkillPin(db, runId, outcome.skill);
		},
		onApproval: async (asked: PermissionAsked) => {
			run.awaitingApproval = true;
			permissions.push(asked);
			await emit('permission.asked', asked);
		},
		// C356: what the workspace tools gave the model joins the leak guard.
		onOutput: (toolName: string, text: string) => {
			if (input.web && !toolName.startsWith('web_')) input.web.ledger.add(text);
		},
	};

	const approval: ApprovalContext = {
		runId,
		conversationId,
		ownerId,
		agent: cardAgentOf(agent),
		// The pages the run had read or quoted: where the request comes
		// from. It grows as the run reads more.
		provenance: () => [
			...new Set([...pages.map((page) => page.id), ...cited.map((source) => source.pageId)]),
		],
	};

	const workspaceEntries = new Map(
		skillIndex.entries.flatMap((entry) =>
			entry.source === 'workspace' && entry.skillId ? [[entry.id, { version: entry.version, skillId: entry.skillId }] as const] : [],
		),
	);
	const loader: WorkspaceSkillLoader | undefined =
		workspaceEntries.size > 0 && input.workspaceId
			? {
					entries: workspaceEntries,
					load: (skillId, version) => loadListedVersion(db, { workspaceId: input.workspaceId as string, skillId, version }),
				}
			: undefined;
	// C1003: a user skill loads only as the run user's own row, by id and version.
	const userSkills = user ? (input.userSkills ?? []) : [];
	const userLoader: WorkspaceSkillLoader | undefined =
		userSkills.length > 0 && user
			? {
					entries: new Map(
						userSkills.flatMap((entry) => (entry.skillId ? [[entry.id, { version: entry.version, skillId: entry.skillId }] as const] : [])),
					),
					load: (itemId, version) => loadUserSkillBody(db, { ownerId: user.userId, itemId, version }),
				}
			: undefined;
	const allowedSkills = [...skillIndex.entries, ...userSkills].map((entry) => entry.id);
	const skillTools = allowedSkills.length > 0 ? [loadSkillTool(allowedSkills, undefined, loader, userLoader)] : [];
	// C1144: a custom agent never gets list_my_context; a built-in one keeps it
	// only when its list names it (keepAgentTools). No query until it is called.
	const contextTools =
		config.contextToolEnabled && user && !(agent && isCustomAgent(agent))
			? [
					listMyContextTool({
						...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
						skills: [...skillIndex.entries, ...userSkills],
						inPrompt: input.promptItemIds ?? new Set(),
					}),
				]
			: [];
	// C42: `remember` proposes; it needs the workspace the memory belongs to.
	const proposalTools = input.workspaceId ? [rememberTool({ workspaceId: input.workspaceId, runId })] : [];

	// C265 / C308 / C339: the MCP tools go in FIRST, before the built-ins and
	// before the allow-list loop below. A built-in agent lists its tools by
	// name and the loop keeps only those, so it strips every MCP tool: a custom
	// agent never reaches one. Never add them after that loop.
	const mcpTools =
		user && input.mcp && input.mcp.tools.length > 0 && input.workspaceId
			? mcpToolSet({
					db,
					redis: input.mcp.redis,
					workspaceId: input.workspaceId,
					tools: input.mcp.tools,
					approval,
					hooks,
					pool,
				})
			: {};
	run.tools = user
		? {
				...mcpTools,
				...readToolSet({ db, user, agentId: agent ? agent.id : null }, hooks, pool, [...skillTools, ...contextTools, ...proposalTools, ...VIEW_TOOLS, ...(input.web ? webTools(input.web) : [])]),
				...(config.bridgeUrl ? writeToolSet({ db, user }, hooks, pool, approval) : {}),
			}
		: undefined;
	// The agent narrows the tools: the set of the run is the intersection of
	// what the runtime offers and what the agent may call. An agent never
	// gains a tool, and a tool the agent does not list is not even sent to
	// the model — it is not in the request.
	if (run.tools) run.tools = keepAgentTools(run.tools, agent);
	if (run.tools && input.webTaint) run.tools = guardTainted(run.tools, input.webTaint, hooks, pool);
	if (run.tools && input.research) run.tools = keepResearchTools(run.tools);
	if (run.tools && input.hooks) run.tools = input.hooks.kind === 'patterns' ? dropBlockedTools(run.tools, input.hooks.patterns) : undefined;
	return run;
}

/** The whole tool set of a research run (C398). */
export const RESEARCH_TOOL_NAMES: readonly string[] = ['web_search', 'web_fetch', 'search_workspace', 'read_page'];

/** Filters to the four names, after every guard: nothing outside the list can survive. */
export function keepResearchTools(tools: ToolSet): ToolSet {
	const kept: ToolSet = {};
	for (const name of RESEARCH_TOOL_NAMES) if (tools[name]) kept[name] = tools[name];
	return kept;
}

/**
 * The tools an agent keeps: its own list, plus the five the runtime always
 * gives. Default-deny: a tool added to the set before this call (an MCP tool,
 * C308/C339) is stripped for every agent and kept only for no agent. A web
 * tool is stripped for every agent too, whatever its list says (C369).
 */
export function keepAgentTools(tools: ToolSet, agent: AgentConfig | null): ToolSet {
	if (!agent) return tools;
	// A custom agent never keeps an MCP tool, even one its stored list names
	// (the table's CHECK refuses it at write; this is the second lock).
	const allowed = new Set(isCustomAgent(agent) ? agent.tools.filter((name) => !name.startsWith('mcp_')) : agent.tools);
	const kept: ToolSet = {};
	for (const [name, tool] of Object.entries(tools)) {
		if (name.startsWith('web_')) continue;
		if (allowed.has(name) || name === 'load_skill' || name === 'remember' || name === 'open_page' || name === 'open_panel' || name === 'open_issue_report' || name === 'suggest_agent') kept[name] = tool;
	}
	return kept;
}
