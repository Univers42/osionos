import type { ApprovalRow } from './types.ts';
import { bridgeWriteOf, applyClaimed } from './apply.ts';
import type { Applied, ApplyCall } from './apply.ts';
import { ADD_MAX_BLOCKS, ADD_MAX_BYTES } from '../tools/writeTools.ts';
import { blocksBytes } from '../tools/blocksBytes.ts';
import { applyAppendMany } from './applyAppend.ts';
import type { AppendEntry } from './applyAppend.ts';

/**
 * Appends to one page and one anchor, auto-applied in the same step, leave as
 * one bridge call: the bridge's client edit round trip (a PATCH) is overtaken
 * by more than 4 appends to a page, which sends the user's edit to a copy page.
 *
 * Caveat (R4): appends merge only inside this window and inside one run, not across
 * steps, and batches of one run leave in the order their windows close, which
 * is not always the order the model proposed them (two pages' batches, or a
 * batch split by the size limit, may overtake each other; appends to one
 * page and anchor keep their order inside a batch). A long turn can still send more than 4 appends to one page within one
 * client PATCH round trip; that over-copies, it does not lose content. A write
 * that arrives after the window closed starts the next batch.
 */
export const COALESCE_WINDOW_MS = 25;

export interface AppendCoalescer {
	enqueue(row: ApprovalRow, call: ApplyCall): Promise<Applied>;
	/** Sends every open batch now: an aborted run does not wait for the window. */
	flush(): Promise<void>;
}

interface Waiter extends AppendEntry {
	resolve(applied: Applied): void;
	reject(error: unknown): void;
}

interface Batch {
	call: ApplyCall;
	waiters: Waiter[];
	timer: ReturnType<typeof setTimeout> | undefined;
	blocks: number;
	bytes: number;
}

async function send(batch: Batch): Promise<void> {
	try {
		const done = await applyAppendMany(batch.call, batch.waiters);
		batch.waiters.forEach((waiter, index) => waiter.resolve(done[index]));
	} catch (error) {
		// Every row hears of the failure, so each settles into a row, never 'executing'.
		batch.waiters.forEach((waiter) => waiter.reject(error));
	}
}

/**
 * The batch limits are measured as `add_blocks` measures its arguments
 * (`blocksBytes`), so a merged batch never passes what the bridge takes in one
 * append (256 KB).
 *
 * Caveat: the batch size is the SUM of the rows' sizes, which is a few bytes
 * above the merged JSON (one comma and a bracket pair per row): a batch may
 * split a little early, never late.
 */
interface State {
	open: Map<string, Batch>;
	inFlight: Set<Promise<void>>;
	// Caveat: once flushed, the coalescer never merges again: a write that claimed
	// before an abort but arrives after the flush goes out alone, at once.
	draining: boolean;
}

function close(state: State, key: string): Promise<void> {
	const batch = state.open.get(key);
	if (!batch) return Promise.resolve();
	clearTimeout(batch.timer);
	state.open.delete(key);
	const sending = send(batch);
	state.inFlight.add(sending);
	void sending.then(() => state.inFlight.delete(sending));
	return sending;
}

function overflows(batch: Batch, blocks: number, bytes: number): boolean {
	return batch.blocks + blocks > ADD_MAX_BLOCKS || batch.bytes + bytes > ADD_MAX_BYTES;
}

function batchFor(state: State, key: string, call: ApplyCall, size: { blocks: number; bytes: number }): Batch {
	const current = state.open.get(key);
	if (current && !overflows(current, size.blocks, size.bytes)) return current;
	void close(state, key);
	const timer = state.draining ? undefined : setTimeout(() => void close(state, key), COALESCE_WINDOW_MS);
	const fresh: Batch = { call, waiters: [], timer, blocks: 0, bytes: 0 };
	state.open.set(key, fresh);
	return fresh;
}

function enqueue(state: State, row: ApprovalRow, call: ApplyCall): Promise<Applied> {
	const write = bridgeWriteOf(row);
	if (!write || !call.bridgeUrl) return applyClaimed(call, row);
	const key = `${String(row.args.pageId)}\0${typeof write.body.afterBlockId === 'string' ? write.body.afterBlockId : 'end'}`;
	const blocks = write.body.blocks as unknown[];
	const size = { blocks: blocks.length, bytes: blocksBytes(blocks) };
	return new Promise<Applied>((resolve, reject) => {
		const batch = batchFor(state, key, call, size);
		batch.waiters.push({ row, write, resolve, reject });
		batch.blocks += size.blocks;
		batch.bytes += size.bytes;
		if (state.draining) void close(state, key);
	});
}

async function flush(state: State): Promise<void> {
	state.draining = true;
	await Promise.all([...state.open.keys()].map((key) => close(state, key)));
	await Promise.allSettled([...state.inFlight]);
}

export function makeAppendCoalescer(): AppendCoalescer {
	const state: State = { open: new Map(), inFlight: new Set(), draining: false };
	return { enqueue: (row, call) => enqueue(state, row, call), flush: () => flush(state) };
}
