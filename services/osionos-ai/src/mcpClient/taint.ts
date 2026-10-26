import type { Pool } from 'pg';
import { config } from '../config.ts';
import { readWebTaint } from '../web/settings.ts';

/**
 * The servers whose output this conversation holds (C286).
 *
 * A write the assistant asks for after reading a third party's output may have
 * been steered by it, and the person looking at a "rename page" card cannot
 * tell. The card carries `influencedBy` so they can. The question is asked of
 * the CONVERSATION, so a continuation run, which is a new run, still knows.
 *
 * Caveat: an approved call counts from the moment it executed; a call the user
 * declined delivered nothing, and is not listed. A conversation that is
 * influenced by a server whose output was later deleted from the transcript is
 * still listed, which over-reports and never under-reports.
 *
 * The web tools taint the conversation too (web C359): its domains follow the
 * servers as `web:<domain>`, read only while OSIONOS_AI_WEB is on, so a
 * database without the web columns is never asked for them.
 */
export async function influencedBy(db: Pool, conversationId: string | null): Promise<string[]> {
	if (!conversationId) return [];
	const result = await db.query<{ label: string }>(
		`select distinct args->>'serverLabel' as label
		   from public.ai_approvals
		  where conversation_id = $1 and tool = 'mcp_call' and status = 'executed'
		  order by label`,
		[conversationId],
	);
	const labels = result.rows.map((row) => `mcp:${row.label}`);
	if (!config.webEnabled) return labels;
	const web = await readWebTaint(db, conversationId);
	return [...labels, ...web.domains.map((domain) => `web:${domain}`)];
}
