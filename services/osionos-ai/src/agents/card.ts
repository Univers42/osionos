import type { Pool } from 'pg';
import { findBuiltinAgent } from './builtins.ts';
import type { AgentConfig } from './config.ts';
import { isCustomAgent } from './config.ts';
import { loadPinnedVersion } from './repo.ts';

/**
 * The agent a card names (C304): who asked, taken from the run's pin and never
 * from the current row, so an edit between the card and the click changes
 * nothing the user was shown.
 */
export interface CardAgent {
	kind: 'builtin' | 'custom';
	id: string;
	name: string;
	version: number;
	scope: 'user' | 'workspace' | null;
}

/** The card line of an agent of a run. */
export function cardAgentOf(agent: AgentConfig | null): CardAgent | null {
	if (!agent) return null;
	if (isCustomAgent(agent)) return { kind: 'custom', id: agent.id, name: agent.name, version: agent.version, scope: agent.scope };
	return { kind: 'builtin', id: agent.id, name: agent.name, version: agent.version, scope: null };
}

/** The pin of a run as a card line; null when the run has no agent or the pin cannot be read. */
export async function cardAgentOfRun(
	db: Pool,
	run: { agent_id: string | null; agent_version: number | null; custom_agent_id: string | null; custom_agent_version: number | null } | null,
): Promise<CardAgent | null> {
	if (!run) return null;
	if (run.custom_agent_id && run.custom_agent_version != null) {
		const pinned = await loadPinnedVersion(db, { agentId: run.custom_agent_id, version: run.custom_agent_version });
		if (!pinned) return null;
		const { agent } = pinned;
		return { kind: 'custom', id: agent.id, name: agent.name, version: agent.version, scope: agent.scope };
	}
	return run.agent_id ? cardAgentOf(findBuiltinAgent(run.agent_id)) : null;
}
