import type { Pool } from 'pg';
import { influencedBy } from '../mcpClient/taint.ts';
import { readWebTaint } from '../web/settings.ts';
import { config } from '../config.ts';

export type TaintReason =
	| 'shared_page' | 'shared_title' | 'attachment' | 'image' | 'thread'
	| 'foreign_skill' | 'foreign_agent' | 'untrusted_tool' | 'unknown_view' | 'legacy';

/**
 * Marks the conversation as holding content the user did not vouch for.
 *
 * The first reason sticks: a conversation already tainted keeps its reason and
 * its time, so a later mark never rewrites why it first became tainted.
 */
export async function markProvenanceTaint(db: Pool, conversationId: string, reason: TaintReason): Promise<void> {
	await db.query(
		`update public.ai_conversations
		    set provenance_tainted_at = now(), provenance_reason = $2
		  where id = $1 and provenance_tainted_at is null`,
		[conversationId, reason],
	);
}

/**
 * Whether the conversation is tainted, and by what: the stored provenance
 * reason, then the web domains, then the MCP servers (both as `web:` / `mcp:`
 * labels, from `influencedBy`).
 *
 * Caveat: web taint is read only while the web flag is on (a database without
 * the web columns is never asked): a flag turned off after a web read
 * under-reports here. A web taint with an empty domain list shows as `web`.
 */
export async function conversationTaint(db: Pool, conversationId: string): Promise<{ tainted: boolean; why: string[] }> {
	const row = await db.query<{ reason: string | null; tainted_at: Date | null }>(
		'select provenance_reason as reason, provenance_tainted_at as tainted_at from public.ai_conversations where id = $1',
		[conversationId],
	);
	const stored = row.rows[0];
	const why: string[] = [];
	if (stored?.tainted_at) why.push(stored.reason ?? 'legacy');
	const labels = await influencedBy(db, conversationId);
	why.push(...labels);
	if (config.webEnabled && !labels.some((label) => label.startsWith('web:')) && (await readWebTaint(db, conversationId)).tainted) why.push('web');
	return { tainted: why.length > 0, why };
}
