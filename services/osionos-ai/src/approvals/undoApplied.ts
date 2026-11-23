import type { Pool } from 'pg';
import { bridgeWrite } from './bridge.ts';
import type { BridgeWrite } from './bridge.ts';
import type { AppliedResult } from './inverseData.ts';
import { claimUndo, releaseUndo } from './repo.ts';
import { APPROVAL_RETENTION_DAYS } from './repo.ts';
import { archiveWrite } from '../builders/undo.ts';
import { inverseLanded } from './undoProbe.ts';
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
 * The most descendant levels the child check looks at. Deeper than this the
 * undo refuses: a tree that deep is not one the AI built in a turn.
 */
const DESCENDANT_DEPTH_MAX = 32;

/**
 * A created page is archived only while it has no live descendant but the
 * pages AI rows of the same turn created: the bridge's archive cascades to
 * every descendant, so a human page under an AI child would go too.
 *
 * "Same turn" is the run's rows of this owner; an outside-agent row has no run,
 * so its set is empty and any live descendant refuses.
 *
 * Caveat: the child check reads the database, not the bridge, so a child
 * made in the last moments before the replica catches up is not seen.
 */
async function planCreate(a: UndoApplied, recorded: Extract<AppliedResult, { tool: 'create_page' }>): Promise<BridgeWrite | Refusal | null> {
	if (!recorded.createdPageId) return null;
	const { run_id: runId, owner_id: ownerId } = a.approval;
	const ours = runId
		? await a.db.query<{ id: string }>(
				`select result->>'createdPageId' as id from public.ai_approvals
				  where run_id = $1 and owner_id = $2 and tool = 'create_page' and result->>'createdPageId' is not null`,
				[runId, ownerId],
			)
		: { rows: [] };
	const foreign = await a.db.query(
		`with recursive d(id, live, depth) as (
		   select id, archived_at is null, 1 from public.osionos_pages where parent_page_id::text = $1
		   union all
		   select p.id, p.archived_at is null, d.depth + 1
		     from public.osionos_pages p join d on p.parent_page_id = d.id where d.depth < $3)
		 select 1 from d where (live and not (id::text = any($2::text[]))) or depth >= $3 limit 1`,
		[recorded.createdPageId, ours.rows.map((row) => row.id), DESCENDANT_DEPTH_MAX],
	);
	if ((foreign.rowCount ?? 0) > 0) return { ok: false, code: 'changed_since' };
	return archiveWrite(recorded.createdPageId);
}

async function plan(a: UndoApplied, recorded: AppliedResult): Promise<BridgeWrite | Refusal | null> {
	if (recorded.tool === 'add_blocks') return planBlocksUndo({ ...a, pageId: recorded.pageId, blocks: recorded.blocks });
	if (recorded.tool === 'rename_page') return planRename(a, recorded);
	return planCreate(a, recorded);
}

/**
 * When the undo window of a row closes: its retention (7 days) from CREATION,
 * not from the decision, so a client never advertises an Undo that `precheck`
 * already refuses as `expired`.
 *
 * Caveat: a row the sweeper has not yet deleted is still refused after this
 * instant, never undone late.
 */
export function undoWindowEnd(row: Pick<ApprovalRow, 'created_at'>): Date {
	return new Date(new Date(row.created_at).getTime() + APPROVAL_RETENTION_DAYS * DAY_MS);
}

/** The instant an undo claimed the row, or null while it stands. */
export function undoneAtOf(row: Pick<ApprovalRow, 'result'>): string | null {
	const at = (row.result as { undoneAt?: unknown } | null)?.undoneAt;
	if (typeof at !== 'string') return null;
	const parsed = new Date(at);
	return Number.isNaN(parsed.getTime()) ? at : parsed.toISOString();
}

/** Whether the recorded inverse is one that can be written at all (a created page the bridge never named has none). */
function hasInverse(recorded: AppliedResult): boolean {
	if (recorded.tool === 'create_page') return recorded.createdPageId !== null;
	if (recorded.tool === 'rename_page') return recorded.previousTitle !== null;
	return true;
}

/**
 * What the client may offer as Undo: the same checks as `precheck`, as a
 * boolean. Caveat: it cannot see the page, so a page changed since the write
 * still answers true here and `changed_since` at the undo itself.
 */
export function isUndoable(row: ApprovalRow, now: Date = new Date()): boolean {
	const recorded = row.status === 'executed' ? recordedOf(row) : null;
	return recorded !== null && hasInverse(recorded) && now <= undoWindowEnd(row) && undoneAtOf(row) === null;
}

/** Why a row cannot be undone at all, before any page is read. */
function precheck(approval: ApprovalRow): UndoResult | null {
	if (approval.status !== 'executed' || !recordedOf(approval)) return { ok: false, code: 'not_undoable' };
	if (new Date() > undoWindowEnd(approval)) return { ok: false, code: 'expired' };
	if ((approval.result as { undoneAt?: unknown }).undoneAt !== undefined) return { ok: false, code: 'already_undone' };
	return null;
}

/** Writes the planned inverse under the claim; a write that does not land gives the claim back. */
async function writeClaimed(a: UndoApplied, write: BridgeWrite): Promise<UndoResult> {
	if (!(await claimUndo(a.db, a.approval.id, a.approval.owner_id))) return { ok: false, code: 'already_undone' };
	const answer = await bridgeWrite({ url: a.bridgeUrl, token: a.sessionToken, write });
	if (answer.ok) return { ok: true };
	// A lost answer (status 0) may still have applied the write: keep the claim then.
	if (answer.status === 0 && (await inverseLanded(a, recordedOf(a.approval) as AppliedResult, write.body.baseVersion))) return { ok: true };
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
