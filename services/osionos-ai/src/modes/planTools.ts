import type { ToolSet } from 'ai';
import { writeTools } from '../tools/writeToolList.ts';

/**
 * The tools a plan-mode run keeps (AM14): the reads only. A plan changes
 * nothing, so a write tool, `build_plan` and every MCP tool are absent from
 * the request rather than refused.
 *
 * Caveat: an MCP tool is recognised by the `mcp_` prefix, so one registered
 * under another name would survive; the MCP loader is the only place that
 * names them, and it always prefixes. `build_plan` is dropped by name even
 * with builders off, where it is not in the set anyway.
 */
export function keepPlanTools(tools: ToolSet): ToolSet {
	const dropped = new Set<string>([...writeTools(true).map((tool) => tool.name), 'build_plan']);
	const kept: ToolSet = {};
	for (const [name, tool] of Object.entries(tools)) {
		if (!dropped.has(name) && !name.startsWith('mcp_')) kept[name] = tool;
	}
	return kept;
}
