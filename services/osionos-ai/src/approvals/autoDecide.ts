import { config } from '../config.ts';
import type { AutoGate } from '../modes/autoGate.ts';
import { isAuthRefusal } from './bridge.ts';
import { applyClaimed } from './apply.ts';
import type { Applied } from './apply.ts';
import { claimApproval, unclaimAuto } from './claim.ts';
import { recordOutcome } from './repo.ts';
import { autoVerdict } from './autoVerdict.ts';
import type { ApprovalRow, CardReason, DecidedBy, WriteApplied } from './types.ts';

/**
 * Applies a write on the user's behalf when an auto mode allows it (AM4): the
 * verdict, the claim, the bridge write with the run's credential, the outcome.
 *
 * A card is not an error: the row stays 'pending' and the human decides as
 * today. `reason` is absent only when the verdict itself could not be computed
 * (a database fault), which cards the write without naming a reason.
 */
export type AutoOutcome =
	| { kind: 'applied'; event: WriteApplied }
	| { kind: 'card'; reason?: CardReason }
	| { kind: 'refused'; error: string };

// Caveat: verdicts and claims of one gate run one at a time, so the turn cap
// counts exactly; the bridge writes themselves still run in parallel.
const queues = new WeakMap<AutoGate, Promise<unknown>>();

function inTurn<T>(g: AutoGate, work: () => Promise<T>): Promise<T> {
	const next = (queues.get(g) ?? Promise.resolve()).then(work, work);
	queues.set(g, next.catch(() => undefined));
	return next;
}

type Claimed = { row: ApprovalRow; decidedBy: DecidedBy } | { card: CardReason | undefined } | { refused: string };

async function claimIfAllowed(g: AutoGate, row: ApprovalRow): Promise<Claimed> {
	try {
		const verdict = await autoVerdict(g, row, Date.now());
		if (verdict.kind === 'card') return { card: verdict.reason };
		const claimed = await claimApproval(g.db, { id: row.id, ownerId: g.user.userId, next: 'executing', decidedBy: verdict.decidedBy });
		return claimed ? { row: claimed, decidedBy: verdict.decidedBy } : { refused: 'the request is no longer open' };
	} catch (error) {
		console.warn(JSON.stringify({ event: 'auto_verdict_failed', code: (error as { code?: unknown }).code ?? (error as Error).name }));
		return { card: undefined };
	}
}

/** The write itself: it never rejects, so a tracked write always settles into a row. */
async function sendWrite(g: AutoGate, row: ApprovalRow): Promise<Applied> {
	try {
		const credential = g.credential;
		if (!credential) throw new Error('no credential');
		return await credential.use((token) => applyClaimed({ db: g.db, bridgeUrl: config.bridgeUrl ?? '', token, holdOnAuthRefusal: true }, row));
	} catch {
		// Past the claim a bridge call may have gone out: the row is 'unknown', never 'executing'.
		const error = 'the write did not finish: check the page';
		await recordOutcome(g.db, { id: row.id, status: 'unknown', error }).catch(() => false);
		return { status: 'unknown', error };
	}
}

function appliedEvent(row: ApprovalRow, decidedBy: DecidedBy, done: Extract<Applied, { status: 'executed' }>): WriteApplied {
	const result = done.result;
	const target = 'createdPageId' in result ? (result.createdPageId ?? '') : result.pageId;
	return {
		approvalId: row.id,
		tool: row.tool,
		target,
		summary: done.detail,
		decidedBy,
		undoable: result.tool === 'add_blocks' || result.tool === 'rename_page' || (result.tool === 'create_page' && result.createdPageId !== null),
	};
}

export async function autoDecide(g: AutoGate, row: ApprovalRow): Promise<AutoOutcome> {
	const claimed = await inTurn(g, () => claimIfAllowed(g, row));
	if ('card' in claimed) return { kind: 'card', ...(claimed.card ? { reason: claimed.card } : {}) };
	if ('refused' in claimed) return { kind: 'refused', error: claimed.refused };
	const done = await g.budget.track(sendWrite(g, claimed.row));
	if (done.status === 'executed') return { kind: 'applied', event: appliedEvent(row, claimed.decidedBy, done) };
	if (isAuthRefusal(done.httpStatus) && (await unclaimAuto(g.db, row.id))) return { kind: 'card', reason: 'credential_rejected' };
	if (isAuthRefusal(done.httpStatus)) await recordOutcome(g.db, { id: row.id, status: 'failed', error: done.error });
	return { kind: 'refused', error: done.error };
}
