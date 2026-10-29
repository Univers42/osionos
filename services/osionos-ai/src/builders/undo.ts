import type { Pool } from 'pg';
import { config } from '../config.ts';
import { bridgeWrite, refusalMessage } from '../approvals/bridge.ts';
import type { BridgeAnswer } from '../approvals/bridge.ts';
import type { ApprovalRow } from '../approvals/types.ts';
import {
	claimItemForUndo,
	countDoneDatabases,
	donePageItems,
	releaseItem,
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
}

/** The sentence an item carries when the cascade would touch pages the plan did not build. */
export const KEPT_FOREIGN_CHILDREN = 'kept: it holds pages that this plan did not build';

/** The live children of a page: the rows the bridge's cascade would archive with it. */
async function liveChildCount(db: Pool, pageId: string): Promise<number> {
	const result = await db.query<{ count: number }>(
		`select count(*)::int as count
		   from public.osionos_pages
		  where parent_page_id = $1::uuid and archived_at is null`,
		[pageId],
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

/**
 * Undo the built pages of an approval, deepest and latest first.
 *
 * The caller has already checked that the approval is a built plan of the
 * caller. Each item is claimed with a conditional UPDATE before any bridge
 * call, so a race archives each page once; a claim that loses is skipped.
 */
export async function undoBuild(input: {
	db: Pool;
	sessionToken: string;
	approval: ApprovalRow;
}): Promise<UndoBuildResult> {
	const { db, sessionToken, approval } = input;
	const pages = await donePageItems(db, approval.id);
	const keptDatabases = await countDoneDatabases(db, approval.id);
	const bridgeUrl = config.bridgeUrl;

	let undone = 0;
	let kept = 0;
	let failed = 0;

	for (const row of pages) {
		const claim = await claimItemForUndo(db, approval.id, row.item_key);
		// Another undo already has this page: it archives it once.
		if (!claim.claimed) continue;
		const pageId = claim.createdId ?? row.created_id;
		if (!pageId) {
			await releaseItem(db, approval.id, row.item_key, null, 'kept: the built page is unknown');
			kept++;
			continue;
		}

		// The bridge's archive cascades. A live child the plan did not build is
		// the user's own page: archiving this page would take it too.
		const children = await liveChildCount(db, pageId);
		if (children > 0) {
			await releaseItem(db, approval.id, row.item_key, pageId, KEPT_FOREIGN_CHILDREN);
			kept++;
			continue;
		}

		let answer: BridgeAnswer;
		if (!bridgeUrl) {
			answer = { ok: false, status: 0, body: '' };
		} else {
			answer = await bridgeWrite({ url: bridgeUrl, token: sessionToken, write: archiveWrite(pageId) });
		}
		if (answer.ok) {
			undone++;
			continue;
		}
		await releaseItem(db, approval.id, row.item_key, pageId, refusalMessage(answer));
		failed++;
	}

	// The approval stays executed or partial: the undo is an outcome of its own,
	// and the row keeps it beside the build's counts.
	await db.query(
		`update public.ai_approvals
		    set result = coalesce(result, '{}'::jsonb) || jsonb_build_object('undone', $2::int)
		  where id = $1`,
		[approval.id, undone],
	);

	return { undone, kept, keptDatabases, failed };
}
