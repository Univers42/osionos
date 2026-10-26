import type { BuiltinAgent } from './builtins.ts';

/**
 * A custom agent, as the configuration of a run (D3).
 *
 * It has the shape of a built-in plus `kind`, so every consumer of an agent
 * keeps one type. `kind` is also what selects the render path: a built-in
 * keeps its raw, byte-identical path (C326), a custom one is escaped
 * (`quotedData`) and carries its scope.
 */
export interface CustomAgentConfig {
	kind: 'custom';
	/** Who owns it: a person, or the workspace (written by an admin). */
	scope: 'user' | 'workspace';
	/** The uuid of the row in ai_agents. */
	id: string;
	version: number;
	name: string;
	description: string;
	instructions: string;
	tools: readonly string[];
	skills: readonly string[];
	/** Always empty: a custom agent cannot read knowledge packs (C332). */
	knowledge: readonly string[];
}

/** An agent of a run: a built-in (no `kind`) or a custom one. */
export type AgentConfig = BuiltinAgent | CustomAgentConfig;

/** True for a custom agent. */
export function isCustomAgent(agent: AgentConfig | null | undefined): agent is CustomAgentConfig {
	return agent != null && 'kind' in agent && agent.kind === 'custom';
}
