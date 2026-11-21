import type { Pool } from 'pg';
import { config } from '../config.ts';
import { BRIDGE_TIMEOUT_MS, bridgeWrite, refusalMessage } from '../approvals/bridge.ts';
import type { BridgeAnswer } from '../approvals/bridge.ts';
import type { ApprovalRow } from '../approvals/types.ts';
import {
	claimItemForUndo,
	countDoneDatabases,
	donePageItems,
	releaseItem,
	type PlanItemRow,
} from './items.ts';

/**
 * The undo of a build (devil C159).
 *
 * "Remove what was built" means the pages THIS plan created, and nothing else.
 * A page is archived through the bridge's own soft-archive path — the PATCH
 * that stamps `archivedAt` — in reverse plan order, so a child goes before its
 * parent.
 *
 * A page that still holds a live child this plan did not build is KEPT: the
 * bridge's archive cascades to the whole subtree, and that subtree is the
 * user's own work. The databases are kept too: an object database has no
 * soft-archive path, so its item stays `done`.
 */

/** What an undo did, in the answer's own words. */
export interface UndoBuildResult {
	undone: number;
	kept: number;
	keptDatabases: number;
	failed: number;
	/** The built pages this pass did not reach before its budget ran out: they stay 'done'. */
	remaining: number;
}

/** The sentence an item carries when the cascade would touch pages the plan did not build. */
export const KEPT_FOREIGN_CHILDREN = 'kept: it holds pages that this plan did not build';

/**
 * The live children of a page that the bridge's cascade would take and this
 * plan did not already claim.
 *
 * A child this approval has claimed ('undone') is mid-archive in a concurrent
 * undo: its PATCH has not landed, but it is plan-built and about to go. Only
 * 'undone' qualifies: a child released 'done' was kept because it holds a
 * user's page, and excluding it would cascade-archive that page. The filter makes
 * the other undo's claim visible to this count; the claim itself stays a
 * separate statement.
 */
async function liveChildCount(db: Pool, approvalId: string, pageId: string): Promise<number> {
	const result = await db.query<{ count: number }>(
		`select count(*)::int as count
		   from public.osionos_pages p
		  where p.parent_page_id = $1::uuid and p.archived_at is null
		    and not exists (
		      select 1 from public.ai_plan_items i
		       where i.approval_id = $2 and i.status = 'undone'
		         and i.created_id::text = p.id::text)`,
		[pageId, approvalId],
	);
	return Number(result.rows[0]?.count ?? 0);
}

/** The archive the bridge is asked for: a stamp, never a delete. */
function archiveWrite(pageId: string): { method: 'PATCH'; path: string; body: Record<string, unknown> } {
	return {
		method: 'PATCH',
		path: `/api/pages/${pageId}`,
		body: { archivedAt: new Date().toISOString() },
	};
}

/** The input of an undo pass. The clock is a parameter, so the tests may move it. */
export interface UndoBuildInput {
	db: Pool;
	sessionToken: string;
	approval: ApprovalRow;
	budgetMs?: number;
	now?: () => number;
}

type ItemOutcome = 'undone' | 'kept' | 'failed' | 'skipped';

async function archivePage(sessionToken: string, pageId: string, timeoutMs: number): Promise<BridgeAnswer> {
	const url = config.bridgeUrl;
	if (!url) return { ok: false, status: 0, body: '' };
	return bridgeWrite({ url, token: sessionToken, write: archiveWrite(pageId), timeoutMs });
}

/**
 * Undo one built page. The item is claimed with a conditional UPDATE before any
 * bridge call, so a race archives each page once; a claim that loses is skipped.
 */
async function undoItem(input: UndoBuildInput, row: PlanItemRow, timeoutMs: number): Promise<ItemOutcome> {
	const { db, approval } = input;
	const claim = await claimItemForUndo(db, approval.id, row.item_key);
	if (!claim.claimed) return 'skipped';
	const pageId = claim.createdId ?? row.created_id;
	if (!pageId) {
		await releaseItem(db, approval.id, row.item_key, null, 'kept: the built page is unknown');
		return 'kept';
	}
	// The bridge's archive cascades. A live child the plan did not build is
	// the user's own page: archiving this page would take it too.
	if ((await liveChildCount(db, approval.id, pageId)) > 0) {
		await releaseItem(db, approval.id, row.item_key, pageId, KEPT_FOREIGN_CHILDREN);
		return 'kept';
	}
	const answer = await archivePage(input.sessionToken, pageId, timeoutMs);
	if (answer.ok) return 'undone';
	await releaseItem(db, approval.id, row.item_key, pageId, refusalMessage(answer));
	return 'failed';
}

/**
 * Undo the built pages of an approval, deepest and latest first, within one
 * pass budget (groot ADR 0071, Q6). The caller has already checked that the
 * approval is a built plan of the caller.
 *
 * Caveat: the budget is checked between items and caps each PATCH, but not the
 * database statements of an item (db.ts bounds those), so a pass can overrun it
 * by one item's worth of database waits.
 */
export async function undoBuild(input: UndoBuildInput): Promise<UndoBuildResult> {
	const { db, approval } = input;
	const budgetMs = input.budgetMs ?? config.buildBudgetMs;
	const now = input.now ?? Date.now;
	const started = now();
	const pages = await donePageItems(db, approval.id);
	const keptDatabases = await countDoneDatabases(db, approval.id);
	const tally = { undone: 0, kept: 0, failed: 0, remaining: 0 };
	for (const [index, row] of pages.entries()) {
		const left = budgetMs - (now() - started);
		if (left <= 0) {
			tally.remaining = pages.length - index;
			break;
		}
		const outcome = await undoItem(input, row, Math.min(BRIDGE_TIMEOUT_MS, left));
		if (outcome !== 'skipped') tally[outcome]++;
	}
	await recordUndone(db, approval.id, tally.undone);
	return { ...tally, keptDatabases };
}

/**
 * The undo is an outcome of its own: the row keeps it beside the build's counts,
 * and its status is the caller's to set.
 */
async function recordUndone(db: Pool, approvalId: string, undone: number): Promise<void> {
	await db.query(
		`update public.ai_approvals
		    set result = coalesce(result, '{}'::jsonb) || jsonb_build_object('undone', $2::int)
		  where id = $1`,
		[approvalId, undone],
	);
}
