import type { Pool } from 'pg';
import { bridgeWrite } from './bridge.ts';
import type { BridgeWrite } from './bridge.ts';
import type { AppliedResult } from './inverseData.ts';
import { claimUndo, releaseUndo } from './repo.ts';
import { APPROVAL_RETENTION_DAYS } from './repo.ts';
import { planBlocksUndo, readPage } from './undoBlocks.ts';
import type { Refusal } from './undoBlocks.ts';
import type { ApprovalRow } from './types.ts';

/**
 * The undo of an applied write (AM8): add_blocks, rename_page, create_page.
 *
 * Every undo checks the page against what the write recorded, claims the row
 * (`result.undoneAt`), writes the inverse with the caller's token, and gives
 * the claim back when that write does not land. A refusal before the claim
 * never claims anything.
 */

export type UndoResult =
	| { ok: true }
	| { ok: false; code: 'changed_since' | 'already_undone' | 'not_undoable' | 'expired' | 'failed' };

export const UNDOABLE_TOOLS: ReadonlySet<string> = new Set(['add_blocks', 'rename_page', 'create_page']);

const DAY_MS = 24 * 60 * 60_000;

export interface UndoApplied {
	db: Pool;
	bridgeUrl: string;
	sessionToken: string;
	approval: ApprovalRow;
}

/** What an applied row recorded for its own tool, or null (a legacy row, a tool with nothing to undo). */
export function recordedOf(row: Pick<ApprovalRow, 'tool' | 'result'>): AppliedResult | null {
	const result = row.result as { tool?: unknown } | null;
	return result && UNDOABLE_TOOLS.has(row.tool) && result.tool === row.tool ? (result as AppliedResult) : null;
}

/**
 * Caveat (R3): a title PATCH carries no version, so a human rename landing
 * between the compare and the PATCH (about one round trip) is overwritten.
 */
async function planRename(a: UndoApplied, recorded: Extract<AppliedResult, { tool: 'rename_page' }>): Promise<BridgeWrite | Refusal | null> {
	if (recorded.previousTitle === null) return null;
	const page = await readPage({ ...a, pageId: recorded.pageId });
	if (!('content' in page)) return page;
	// The bridge reads an empty title as 'Untitled'; the recorded title may be the empty one.
	if (page.title !== (recorded.appliedTitle || 'Untitled')) return { ok: false, code: 'changed_since' };
	return { method: 'PATCH', path: `/api/pages/${recorded.pageId}`, body: { title: recorded.previousTitle } };
}

/**
 * A created page is archived only while it holds no live child but the pages
 * AI rows of the same turn created (the bridge's archive cascades).
 *
 * Caveat: the child check reads the database, not the bridge, so a child
 * made in the last moments before the replica catches up is not seen.
 */
async function planCreate(a: UndoApplied, recorded: Extract<AppliedResult, { tool: 'create_page' }>): Promise<BridgeWrite | Refusal | null> {
	if (!recorded.createdPageId) return null;
	const ours = await a.db.query<{ id: string }>(
		`select result->>'createdPageId' as id from public.ai_approvals
		  where run_id is not distinct from $1 and tool = 'create_page' and result->>'createdPageId' is not null`,
		[a.approval.run_id],
	);
	const foreign = await a.db.query(
		`select 1 from public.osionos_pages
		  where parent_page_id::text = $1 and archived_at is null and not (id::text = any($2::text[])) limit 1`,
		[recorded.createdPageId, ours.rows.map((row) => row.id)],
	);
	if ((foreign.rowCount ?? 0) > 0) return { ok: false, code: 'changed_since' };
	return { method: 'PATCH', path: `/api/pages/${recorded.createdPageId}`, body: { archivedAt: new Date().toISOString() } };
}

async function plan(a: UndoApplied, recorded: AppliedResult): Promise<BridgeWrite | Refusal | null> {
	if (recorded.tool === 'add_blocks') return planBlocksUndo({ ...a, pageId: recorded.pageId, blocks: recorded.blocks });
	if (recorded.tool === 'rename_page') return planRename(a, recorded);
	return planCreate(a, recorded);
}

/** Why a row cannot be undone at all, before any page is read. */
function precheck(approval: ApprovalRow): UndoResult | null {
	if (approval.status !== 'executed' || !recordedOf(approval)) return { ok: false, code: 'not_undoable' };
	// Caveat: the window is the row's retention (7 days from creation); a row
	// the sweeper has not yet deleted is still refused here, never undone late.
	if (Date.now() - new Date(approval.created_at).getTime() > APPROVAL_RETENTION_DAYS * DAY_MS) return { ok: false, code: 'expired' };
	if ((approval.result as { undoneAt?: unknown }).undoneAt !== undefined) return { ok: false, code: 'already_undone' };
	return null;
}

/** Writes the planned inverse under the claim; a write that does not land gives the claim back. */
async function writeClaimed(a: UndoApplied, write: BridgeWrite): Promise<UndoResult> {
	if (!(await claimUndo(a.db, a.approval.id, a.approval.owner_id))) return { ok: false, code: 'already_undone' };
	const answer = await bridgeWrite({ url: a.bridgeUrl, token: a.sessionToken, write });
	if (answer.ok) return { ok: true };
	await releaseUndo(a.db, a.approval.id);
	return { ok: false, code: answer.status === 409 ? 'changed_since' : 'failed' };
}

export async function undoApplied(a: UndoApplied): Promise<UndoResult> {
	const refused = precheck(a.approval);
	if (refused) return refused;
	const planned = await plan(a, recordedOf(a.approval) as AppliedResult);
	if (planned === null) return { ok: false, code: 'not_undoable' };
	if ('ok' in planned) return planned;
	return writeClaimed(a, planned);
}
