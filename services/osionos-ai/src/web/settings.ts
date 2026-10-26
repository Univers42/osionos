import type { Pool } from 'pg';
import { inTransaction } from '../db.ts';

/**
 * The web state the database holds (web C358, C359, C370): the switch of a
 * workspace and the taint of a conversation. Both tables come from
 * models/osionos-ai-web-migration.sql.
 */

/** The approval card names at most this many domains; the CHECK of the column agrees. */
export const MAX_TAINT_DOMAINS = 5;

/** The switch "Allow web access": no row is off. */
export async function readWorkspaceWeb(db: Pool, workspaceId: string): Promise<boolean> {
	const result = await db.query<{ web_enabled: boolean }>(
		'select web_enabled from public.ai_workspace_web_settings where workspace_id = $1',
		[workspaceId],
	);
	return result.rows[0]?.web_enabled ?? false;
}

/**
 * Sets the switch; a flip (and only a flip) writes one audit row, in the same
 * transaction. The row lock orders two concurrent flips, so each audit row
 * records a real change.
 */
export async function writeWorkspaceWeb(
	db: Pool,
	input: { workspaceId: string; actorId: string; enabled: boolean },
): Promise<void> {
	await inTransaction(db, async (client) => {
		await client.query(
			`insert into public.ai_workspace_web_settings (workspace_id, web_enabled, updated_by)
			 values ($1, false, $2) on conflict (workspace_id) do nothing`,
			[input.workspaceId, input.actorId],
		);
		const current = await client.query<{ web_enabled: boolean }>(
			'select web_enabled from public.ai_workspace_web_settings where workspace_id = $1 for update',
			[input.workspaceId],
		);
		if (current.rows[0]?.web_enabled === input.enabled) return;
		await client.query(
			`update public.ai_workspace_web_settings set web_enabled = $2, updated_by = $3, updated_at = now()
			  where workspace_id = $1`,
			[input.workspaceId, input.enabled, input.actorId],
		);
		await client.query(
			'insert into public.ai_web_switch_audit (workspace_id, actor_id, web_enabled) values ($1, $2, $3)',
			[input.workspaceId, input.actorId, input.enabled],
		);
	});
}

/** The taint of a conversation, as a continuation run reads it back. */
export async function readWebTaint(db: Pool, conversationId: string): Promise<{ tainted: boolean; domains: string[] }> {
	const result = await db.query<{ web_tainted_at: Date | null; web_domains: string[] }>(
		'select web_tainted_at, web_domains from public.ai_conversations where id = $1',
		[conversationId],
	);
	const row = result.rows[0];
	return { tainted: Boolean(row?.web_tainted_at), domains: row?.web_domains ?? [] };
}

/**
 * Marks the conversation tainted with the run's domain list (at most
 * MAX_TAINT_DOMAINS, built by the caller). The first mark's time stays.
 */
export async function markWebTaint(db: Pool, conversationId: string, domains: readonly string[]): Promise<void> {
	await db.query(
		'update public.ai_conversations set web_tainted_at = coalesce(web_tainted_at, now()), web_domains = $2 where id = $1',
		[conversationId, domains.slice(0, MAX_TAINT_DOMAINS)],
	);
}
