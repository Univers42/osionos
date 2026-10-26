import type { Pool } from 'pg';

/**
 * The switches of a workspace for custom agents (C305): a server table, never
 * a value the client sends. A workspace with no row gets the defaults.
 */

export interface AgentSettings {
	agents_enabled: boolean;
	custom_agents_allowed: boolean;
}

/** No row: agents on, user-scope agents of non-admins off. */
export const DEFAULT_AGENT_SETTINGS: AgentSettings = { agents_enabled: true, custom_agents_allowed: false };

export async function readAgentSettings(db: Pool, workspaceId: string): Promise<AgentSettings> {
	const result = await db.query<AgentSettings>(
		'select agents_enabled, custom_agents_allowed from public.ai_workspace_agent_settings where workspace_id = $1',
		[workspaceId],
	);
	return result.rows[0] ?? DEFAULT_AGENT_SETTINGS;
}

export async function writeAgentSettings(
	db: Pool,
	input: AgentSettings & { workspaceId: string; actorId: string },
): Promise<void> {
	await db.query(
		`insert into public.ai_workspace_agent_settings (workspace_id, agents_enabled, custom_agents_allowed, updated_by, updated_at)
		 values ($1, $2, $3, $4, now())
		 on conflict (workspace_id) do update
		   set agents_enabled = excluded.agents_enabled, custom_agents_allowed = excluded.custom_agents_allowed,
		       updated_by = excluded.updated_by, updated_at = now()`,
		[input.workspaceId, input.agents_enabled, input.custom_agents_allowed, input.actorId],
	);
}
