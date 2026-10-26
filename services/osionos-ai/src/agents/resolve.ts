import type { Pool } from 'pg';
import type { AuthUser } from '../auth.ts';
import type { RunRow } from '../runs/repo.ts';
import { canAdminAgents, canRunAgents } from './authority.ts';
import { findBuiltinAgent, READ_TOOL_NAMES, WRITE_TOOL_NAMES } from './builtins.ts';
import type { AgentConfig, CustomAgentConfig } from './config.ts';
import { usableSkills } from './prefix.ts';
import { getAgent, loadPinnedVersion } from './repo.ts';
import type { StoredAgent } from './repo.ts';
import { readAgentSettings } from './settings.ts';

/**
 * Which agent a run may use, and whether it may run it now (D3).
 *
 * `assertAgentRunnable` is the ONE gate (C334): a new run and a continuation
 * both pass through it, so a rule added there cannot be missed by one of them.
 */

/** The user the erasure leaves in place of an author (models/osionos-ai-runs-agents-migration.sql). */
const TOMBSTONE = '00000000-0000-4000-8000-000000000000';

/** A refusal with the status and the code the client gets. */
export class AgentRefusal extends Error {
	readonly status: number;
	readonly code: string;

	constructor(status: number, code: string) {
		super(code);
		this.status = status;
		this.code = code;
	}
}

const TOOL_NAMES: ReadonlySet<string> = new Set([...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES]);

/** The tools of a stored agent that the registry still has; the rest are dropped with a log line (C306). */
export function usableTools(agentId: string, tools: readonly string[]): string[] {
	const kept = tools.filter((name) => TOOL_NAMES.has(name) && !name.startsWith('mcp_'));
	const dropped = tools.filter((name) => !kept.includes(name));
	if (dropped.length > 0) console.warn(JSON.stringify({ event: 'agent_tool_dropped', agentId, dropped }));
	return kept;
}

/** The stored row as the configuration of a run. */
export function toAgentConfig(stored: StoredAgent): CustomAgentConfig {
	return {
		kind: 'custom',
		scope: stored.scope,
		id: stored.id,
		version: stored.version,
		name: stored.name,
		description: stored.description,
		instructions: stored.instructions,
		tools: usableTools(stored.id, stored.tools),
		skills: usableSkills(stored.skills),
		knowledge: [],
	};
}

/** A user with no claim at all: only the member row can make them an admin. */
function blankUser(userId: string): AuthUser {
	return { userId, workspaceId: '', memberWorkspaces: [], isAdmin: false, issuedAtMs: 0 };
}

/**
 * C299: a workspace agent is only as trusted as the author of the version being
 * run. Derived at read time; an erased author (the tombstone) never passes.
 */
export async function needsReview(db: Pool, stored: StoredAgent, authorId: string): Promise<boolean> {
	if (stored.scope !== 'workspace' || !stored.workspace_id) return false;
	if (authorId === TOMBSTONE) return true;
	return !(await canAdminAgents(db, blankUser(authorId), stored.workspace_id));
}

/** The version to judge: the row, who wrote that version, and whether the run is new. */
export interface Candidate {
	stored: StoredAgent;
	authorId: string;
	newRun: boolean;
}

/** Throws an AgentRefusal when the caller may not run the agent in that conversation now. */
export async function assertAgentRunnable(
	db: Pool,
	user: AuthUser,
	candidate: Candidate,
	conversationWorkspaceId: string,
): Promise<void> {
	const { stored } = candidate;
	// Somebody else's agent does not exist for the caller.
	if (stored.scope === 'user' && stored.owner_id !== user.userId) throw new AgentRefusal(404, 'not_found');
	const settings = await readAgentSettings(db, conversationWorkspaceId);
	if (!settings.agents_enabled) throw new AgentRefusal(409, 'agents_disabled');
	if (stored.scope === 'workspace' && stored.workspace_id !== conversationWorkspaceId) {
		throw new AgentRefusal(409, 'agent_wrong_workspace');
	}
	if (!(await canRunAgents(db, user, conversationWorkspaceId))) throw new AgentRefusal(403, 'forbidden');
	if (stored.scope === 'user' && !settings.custom_agents_allowed && !(await canAdminAgents(db, user, conversationWorkspaceId))) {
		throw new AgentRefusal(403, 'custom_agents_not_allowed');
	}
	if (await needsReview(db, stored, candidate.authorId)) throw new AgentRefusal(409, 'agent_needs_review');
	if (candidate.newRun && stored.archived_at !== null) throw new AgentRefusal(409, 'agent_archived');
}

/**
 * The agent of a NEW run. The configuration carries the id and the version of
 * the exact row that was judged, so nothing can change between check and insert.
 */
export async function loadRunnableAgent(
	db: Pool,
	user: AuthUser,
	agentId: string,
	conversationWorkspaceId: string,
): Promise<CustomAgentConfig> {
	const stored = await getAgent(db, agentId);
	if (!stored) throw new AgentRefusal(404, 'not_found');
	await assertAgentRunnable(db, user, { stored, authorId: stored.updated_by, newRun: true }, conversationWorkspaceId);
	return toAgentConfig(stored);
}

export type PinnedResolution =
	| { ok: true; agent: AgentConfig | null }
	| { ok: false; reason: string };

/**
 * The agent of a continuation (C333): exactly the version the run pinned, under
 * the same gate as a new run. Every path that cannot prove the pin is a refusal;
 * a custom pin never becomes null or a built-in.
 */
export async function resolvePinnedAgent(
	db: Pool,
	user: AuthUser,
	run: RunRow | null,
	conversationWorkspaceId: string,
): Promise<PinnedResolution> {
	try {
		if (!run) return { ok: false, reason: 'run_missing' };
		if (run.custom_agent_id == null) {
			// A removed built-in is null, as before: only a built-in pin may land here.
			return { ok: true, agent: run.agent_id ? findBuiltinAgent(run.agent_id) : null };
		}
		if (run.custom_agent_version == null) return { ok: false, reason: 'agent_version_missing' };
		const pinned = await loadPinnedVersion(db, { agentId: run.custom_agent_id, version: run.custom_agent_version });
		if (!pinned) return { ok: false, reason: 'agent_version_missing' };
		const candidate = { stored: pinned.agent, authorId: pinned.authorId, newRun: false };
		await assertAgentRunnable(db, user, candidate, conversationWorkspaceId);
		return { ok: true, agent: toAgentConfig(pinned.agent) };
	} catch (error) {
		if (error instanceof AgentRefusal) return { ok: false, reason: error.code };
		console.warn(JSON.stringify({ event: 'agent_resolve_failed', message: error instanceof Error ? error.message : 'unknown' }));
		return { ok: false, reason: 'agent_check_failed' };
	}
}
