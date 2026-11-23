import type { Pool } from 'pg';
import { config } from '../config.ts';
import { modesAllowed } from '../modes/modesConfig.ts';
import type { AuthUser } from '../auth.ts';
import type { RunViewTab } from '../runs/prompt.ts';
import type { SkillIndexEntry } from '../skills/runSkills.ts';
import { markProvenanceTaint } from './repo.ts';
import type { TaintReason } from './repo.ts';
import { untrustedPageIds, writtenOnlyBy } from './trust.ts';

export interface RunStartCustomAgent {
	scope: 'user' | 'workspace';
	ownerId: string | null;
	createdBy: string;
	updatedBy: string;
}

export interface RunStartInputs {
	conversationId: string;
	user: AuthUser;
	contextPageIds: string[];
	sourcePageIds: string[];
	overviewPageIds: string[];
	viewTabs: RunViewTab[];
	attachmentCount: number;
	imageCount: number;
	skillIndex: SkillIndexEntry[];
	customAgent: RunStartCustomAgent | null;
	thread: boolean;
}

function agentIsForeign(agent: RunStartCustomAgent, userId: string): boolean {
	if (agent.scope === 'user' && agent.ownerId === userId) return false;
	return !writtenOnlyBy(userId, agent.createdBy, agent.updatedBy);
}

async function hasForeignSkill(db: Pool, userId: string, skills: readonly SkillIndexEntry[]): Promise<boolean> {
	const workspaceSkills = skills.filter((skill) => skill.source === 'workspace');
	// A workspace skill with no row id cannot be looked up, so it is not vouched for.
	if (workspaceSkills.some((skill) => !skill.skillId)) return true;
	const ids = workspaceSkills.flatMap((skill) => (skill.skillId ? [skill.skillId] : []));
	if (ids.length === 0) return false;
	const rows = await db.query<{ created_by: string; updated_by: string }>(
		'select created_by::text, updated_by::text from public.ai_skills where id = any($1::uuid[])',
		[ids],
	);
	// A listed skill with no row is not vouched for either.
	return rows.rowCount !== ids.length || rows.rows.some((row) => !writtenOnlyBy(userId, row.created_by, row.updated_by));
}

/** The reason from what the run hands the model without a page read, or null. */
async function cheapReason(db: Pool, i: RunStartInputs): Promise<TaintReason | null> {
	if (i.thread) return 'thread';
	if (i.attachmentCount > 0) return 'attachment';
	if (i.imageCount > 0) return 'image';
	if (await hasForeignSkill(db, i.user.userId, i.skillIndex)) return 'foreign_skill';
	if (i.customAgent && agentIsForeign(i.customAgent, i.user.userId)) return 'foreign_agent';
	if (i.viewTabs.some((tab) => (tab.kind === 'page' || tab.kind === 'database') && !tab.pageId)) return 'unknown_view';
	return null;
}

async function pageReason(db: Pool, i: RunStartInputs): Promise<TaintReason | null> {
	const quoted = [...i.contextPageIds, ...i.sourcePageIds, ...i.viewTabs.flatMap((tab) => (tab.pageId ? [tab.pageId] : []))];
	if ((await untrustedPageIds(db, i.user, quoted)).length > 0) return 'shared_page';
	if ((await untrustedPageIds(db, i.user, i.overviewPageIds)).length > 0) return 'shared_title';
	return null;
}

/**
 * Taints the conversation, before the model sees anything, when the run hands
 * it content the user did not write: an attachment, an image, a channel
 * thread, a skill or agent someone else edited, a tab with no page id, or a
 * page, source or overview title that is not trusted (`untrustedPageIds`).
 * Built-ins and the user's approved memories are trusted. Returns the reason
 * found first; the stored reason is the first ever (`markProvenanceTaint`).
 *
 * Caveat (AM3): the page rules are today's ACL, see `untrustedPageIds`. The
 * view tabs are the client's word: a tab whose id the client invents is only as
 * good as that page's own trust, and a tab it omits is not seen.
 */
export async function markRunStartProvenance(db: Pool, i: RunStartInputs): Promise<TaintReason | null> {
	const reason = (await cheapReason(db, i)) ?? (await pageReason(db, i));
	if (reason) await markProvenanceTaint(db, i.conversationId, reason);
	return reason;
}

/** What the runner knows at the start of a run: the custom agent only by id, the caller possibly absent. */
export type RunStartRaw = Omit<RunStartInputs, 'customAgent' | 'user' | 'contextPageIds' | 'sourcePageIds' | 'overviewPageIds'> & {
	user: AuthUser | undefined;
	customAgentId: string | null;
	contextPages: readonly { id: string }[];
	sources: readonly { pageId: string }[];
	overview: { tree: readonly { id: string }[]; recent: readonly { id: string }[] } | null;
};

async function customAgentOf(db: Pool, agentId: string | null): Promise<RunStartCustomAgent | null> {
	if (!agentId) return null;
	const row = await db.query<{ scope: 'user' | 'workspace'; owner_id: string | null; created_by: string; updated_by: string }>(
		'select scope, owner_id::text, created_by::text, updated_by::text from public.ai_agents where id = $1',
		[agentId],
	);
	const found = row.rows[0];
	// A row that cannot be read is not vouched for: no id of a user equals ''.
	return found
		? { scope: found.scope, ownerId: found.owner_id, createdBy: found.created_by, updatedBy: found.updated_by }
		: { scope: 'workspace', ownerId: null, createdBy: '', updatedBy: '' };
}

/** Logs a code, never a message; a null or undefined rejection has neither, so it logs 'unknown'. */
export function logTaintFailure(error: unknown): void {
	const code = (error as { code?: unknown } | null)?.code ?? (error as Error | null)?.name ?? 'unknown';
	console.warn(JSON.stringify({ event: 'provenance_check_failed', code }));
}

async function checkRunStart(db: Pool, raw: RunStartRaw, user: AuthUser): Promise<TaintReason | null> {
	const { customAgentId, contextPages, sources, overview, ...rest } = raw;
	const customAgent = await customAgentOf(db, customAgentId);
	const pages = {
		contextPageIds: contextPages.map((page) => page.id),
		// A pack chunk has no page id: it is not a page.
		sourcePageIds: sources.map((source) => source.pageId).filter((id) => id !== ''),
		overviewPageIds: overview ? [...overview.tree, ...overview.recent].map((entry) => entry.id) : [],
	};
	return markRunStartProvenance(db, { ...rest, ...pages, user, customAgent });
}

/**
 * The runner's call: completes the inputs from the database, then marks.
 *
 * Fail closed: a caller who may not use modes (or no caller) gets one UPDATE
 * with reason 'legacy' and no other read; a check that throws taints 'legacy'
 * and is logged by code. Only a failing taint write propagates.
 *
 * Caveat: 'legacy' over-reports (a conversation that only failed its check is
 * never auto-written to); the escape hatch is a new conversation.
 */
export async function markRunStart(db: Pool, raw: RunStartRaw): Promise<TaintReason | null> {
	const { user } = raw;
	if (!user || !modesAllowed(config, user.userId)) {
		// flag off: one UPDATE, the cheapest fail-closed — not 'no query'.
		await markProvenanceTaint(db, raw.conversationId, 'legacy');
		return 'legacy';
	}
	try {
		return await checkRunStart(db, raw, user);
	} catch (error) {
		logTaintFailure(error);
		await markProvenanceTaint(db, raw.conversationId, 'legacy');
		return 'legacy';
	}
}
