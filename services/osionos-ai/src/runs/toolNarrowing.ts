import type { ToolSet } from 'ai';
import { isCustomAgent } from '../agents/config.ts';
import type { AgentConfig } from '../agents/config.ts';

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
