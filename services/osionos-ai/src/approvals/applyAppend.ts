import type { ApprovalRow } from './types.ts';
import { bridgeWrite, holdsOutcome, refusalMessage } from './bridge.ts';
import type { BridgeWrite } from './bridge.ts';
import { recordOutcome } from './repo.ts';
import { blockDigest } from './inverseData.ts';
import type { AddedBlock } from './inverseData.ts';
import type { Applied, ApplyCall } from './apply.ts';

/**
 * The append, approved: one write, retried once when the bridge did not answer.
 *
 * The retry is safe because it carries the same idempotency key and the same
 * ids: the bridge appends once whatever the number of calls (C226). When the
 * second call gets no answer either, the outcome is UNKNOWN — the blocks may
 * be on the page — and never "failed", which would invite a second approval
 * that writes them twice (C238).
 */

/**
 * The most of the append's answer that is read: it carries the whole page.
 *
 * Caveat: a page whose JSON passes this is read as cut, and the placement is
 * reported 'unknown' (the write still landed).
 */
const APPEND_ANSWER_MAX_CHARS = 8_000_000;

/**
 * What an append did, read from the bridge's answer: the version it produced,
 * and whether the blocks sit where the card said.
 *
 * The append lands at the END when the block it follows is gone since the
 * card was shown (the bridge's rule for an unknown id): the user is told so,
 * never "added after …" on a page where they are not.
 */
export function appendOutcome(
	write: BridgeWrite,
	answerBody: string,
): { version: number | null; placed: 'after' | 'end' | 'unknown' } {
	let parsed: { version?: unknown; content?: unknown };
	try {
		parsed = JSON.parse(answerBody) as { version?: unknown; content?: unknown };
	} catch {
		return { version: null, placed: 'unknown' };
	}
	const version = Number.isSafeInteger(parsed.version) ? Number(parsed.version) : null;
	const content = Array.isArray(parsed.content) ? (parsed.content as { id?: unknown }[]) : null;
	const firstId = (write.body.blocks as { id: string }[])[0]?.id;
	const afterId = write.body.afterBlockId;
	if (!content || !firstId) return { version, placed: 'unknown' };
	const at = content.findIndex((block) => block?.id === firstId);
	if (at === -1) return { version, placed: 'unknown' };
	if (typeof afterId !== 'string') return { version, placed: 'end' };
	return { version, placed: at > 0 && content[at - 1]?.id === afterId ? 'after' : 'end' };
}

/** The words of an append that landed. */
function appendSummary(count: number, outcome: ReturnType<typeof appendOutcome>, asked: boolean): string {
	const blocks = count === 1 ? '1 block was' : `${count} blocks were`;
	const at = outcome.version === null ? '' : ` (page version ${outcome.version})`;
	if (asked && outcome.placed === 'end') {
		return `${blocks} added at the end of the page: the block they were to follow is gone${at}`;
	}
	const where = outcome.placed === 'after' ? ' after the block shown on the card' : ' at the end of the page';
	return `${blocks} added${where}${at}`;
}

/** The blocks the write sent, as the record an undo reads. */
function addedBlocksOf(write: BridgeWrite): AddedBlock[] {
	const sent = write.body.blocks as { id: string; type: string; content: string }[];
	return sent.map((block, index) => ({ id: block.id, parentId: null, index, sha256: blockDigest(block) }));
}

async function sendOnce(call: ApplyCall, write: BridgeWrite) {
	return bridgeWrite({ url: call.bridgeUrl, token: call.token, write, maxBodyChars: APPEND_ANSWER_MAX_CHARS });
}

export async function applyAppend(call: ApplyCall, row: ApprovalRow, write: BridgeWrite): Promise<Applied> {
	let answer = await sendOnce(call, write);
	if (answer.status === 0) answer = await sendOnce(call, write);
	if (answer.status === 0) {
		const error = 'the bridge did not answer: the blocks may have been added, check the page';
		await recordOutcome(call.db, { id: row.id, status: 'unknown', error });
		return { status: 'unknown', error };
	}
	if (!answer.ok) {
		const error = refusalMessage(answer);
		if (!holdsOutcome(call, answer.status)) await recordOutcome(call.db, { id: row.id, status: 'failed', error });
		return { status: 'failed', error, httpStatus: answer.status };
	}
	const outcome = appendOutcome(write, answer.body);
	const blocks = addedBlocksOf(write);
	const summary = appendSummary(blocks.length, outcome, typeof write.body.afterBlockId === 'string');
	const pageId = String(row.args.pageId);
	const result = { tool: 'add_blocks' as const, pageId, version: outcome.version, blocks, summary };
	const recorded = { ok: true, placed: outcome.placed, ...result };
	await recordOutcome(call.db, { id: row.id, status: 'executed', result: recorded });
	return { status: 'executed', result, recorded, detail: summary };
}
