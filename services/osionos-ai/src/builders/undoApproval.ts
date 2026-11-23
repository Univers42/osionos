import type { Pool } from 'pg';
import { claimPartial, getOwnedApproval, recordOutcome } from '../approvals/repo.ts';
import type { ApprovalRow } from '../approvals/types.ts';
import { config } from '../config.ts';
import { donePageItems } from './items.ts';
import { UNDOABLE_TOOLS, recordedOf } from '../approvals/undoApplied.ts';
import { undoBuild, type UndoBuildResult } from './undo.ts';

/**
 * Who may undo an approval, and the claim an undo of a partial one holds
 * (groot ADR 0071, osionos#333).
 *
 * A 'partial' approval can also be resumed, so its undo claims the row with the
 * same statement a resume uses (`claimPartial`, partial → executing). Whoever
 * claims second loses with a 409 before any bridge call, the sweeper recovers
 * a claim a crash left behind, and the card says "Writing…" meanwhile. An
 * 'executed' approval cannot be resumed: its undo stays unclaimed (ADR 0070).
 */

/** An undo pass, minus the claim. */
export interface UndoRun {
	db: Pool;
	sessionToken: string;
	approval: ApprovalRow;
}

export type UndoOutcome =
	| { kind: 'refused'; status: 404 | 409; code: string }
	| {
			kind: 'undone';
			result: UndoBuildResult;
			/** False when the sweeper took the claim before the undo handed it back. */
			restored: boolean;
	  };

/** Why an approval cannot be undone now, or null when it can. */
export function undoRefusal(approval: Pick<ApprovalRow, 'tool' | 'status' | 'result'>): string | null {
	// An applied write that recorded its inverse goes to `undoApplied`; one that
	// did not (a row from before the record) keeps the old answer. With the modes
	// flag off nothing is routed there: the answer is the pre-modes `not_a_plan`.
	if (approval.tool !== 'build_plan') {
		if (!config.modesEnabled) return 'not_a_plan';
		if (recordedOf(approval)) return null;
		return UNDOABLE_TOOLS.has(approval.tool) ? 'not_a_plan' : 'not_undoable';
	}
	// A write is in flight (a resume, or another undo): the caller may try again.
	if (approval.status === 'executing') return 'approval_busy';
	if (approval.status !== 'executed' && approval.status !== 'partial') return 'approval_not_built';
	return null;
}

/** The built pages of an approval, archived once; a refusal when none is left. */
export async function undoPages(run: UndoRun): Promise<UndoOutcome> {
	const pages = await donePageItems(run.db, run.approval.id);
	if (pages.length === 0) return { kind: 'refused', status: 409, code: 'nothing_to_undo' };
	return { kind: 'undone', result: await undoBuild(run), restored: true };
}

/**
 * The undo of a partial approval, under its claim. Every exit after the claim,
 * a throw included, hands the row back as 'partial' (Q4); a hand-back the
 * sweeper beat is reported, never hidden (Q5).
 */
export async function undoClaimed(run: UndoRun, ownerId: string): Promise<UndoOutcome> {
	const claimed = await claimPartial(run.db, { id: run.approval.id, ownerId });
	if (!claimed) return claimLost(run.db, run.approval.id, ownerId);
	let outcome: UndoOutcome;
	let restored: boolean;
	try {
		outcome = await undoPages({ ...run, approval: claimed });
	} finally {
		restored = await recordOutcome(run.db, { id: claimed.id, status: 'partial', error: claimed.error });
	}
	return outcome.kind === 'undone' ? { ...outcome, restored } : outcome;
}

/** The claim went to somebody else, or the row is gone. */
async function claimLost(db: Pool, id: string, ownerId: string): Promise<UndoOutcome> {
	const owned = await getOwnedApproval(db, { id, ownerId });
	if (!owned) return { kind: 'refused', status: 404, code: 'not_found' };
	return { kind: 'refused', status: 409, code: 'approval_busy' };
}
