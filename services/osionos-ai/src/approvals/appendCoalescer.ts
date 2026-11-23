import type { ApprovalRow } from './types.ts';
import { bridgeWriteOf, applyClaimed } from './apply.ts';
import type { Applied, ApplyCall } from './apply.ts';
import { ADD_MAX_BLOCKS, ADD_MAX_BYTES } from '../tools/writeTools.ts';
import { applyAppendMany } from './applyAppend.ts';
import type { AppendEntry } from './applyAppend.ts';

/**
 * Appends to one page and one anchor, auto-applied in the same step, leave as
 * one bridge call: the bridge's client edit round trip (a PATCH) is overtaken
 * by more than 4 appends to a page, which sends the user's edit to a copy page.
 *
 * Caveat (R4): appends merge only inside this window and inside one run, not across
 * steps. A long turn can still send more than 4 appends to one page within one
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

/**
 * The size add_blocks measures its arguments by (writeTools.ts), so a merged
 * batch never passes what the bridge takes in one append (256 KB).
 *
 * Caveat: the batch size is the SUM of the rows' sizes, which is a few bytes
 * above the merged JSON (one comma and a bracket pair per row): a batch may
 * split a little early, never late.
 */
const bytesOf = (blocks: unknown[]): number => Buffer.byteLength(JSON.stringify(blocks), 'utf8');

async function send(batch: Batch): Promise<void> {
	try {
		const done = await applyAppendMany(batch.call, batch.waiters);
		batch.waiters.forEach((waiter, index) => waiter.resolve(done[index]));
	} catch (error) {
		// Every row hears of the failure, so each settles into a row, never 'executing'.
		batch.waiters.forEach((waiter) => waiter.reject(error));
	}
}

export function makeAppendCoalescer(): AppendCoalescer {
	const open = new Map<string, Batch>();
	const inFlight = new Set<Promise<void>>();
	// Caveat: once flushed, the coalescer never merges again: a write that claimed
	// before an abort but arrives after the flush goes out alone, at once.
	let draining = false;

	const close = (key: string): Promise<void> => {
		const batch = open.get(key);
		if (!batch) return Promise.resolve();
		clearTimeout(batch.timer);
		open.delete(key);
		const sending = send(batch);
		inFlight.add(sending);
		void sending.then(() => inFlight.delete(sending));
		return sending;
	};

	const overflows = (batch: Batch, blocks: number, bytes: number): boolean =>
		batch.blocks + blocks > ADD_MAX_BLOCKS || batch.bytes + bytes > ADD_MAX_BYTES;

	const batchFor = (key: string, call: ApplyCall, blocks: number, bytes: number): Batch => {
		const current = open.get(key);
		if (current && !overflows(current, blocks, bytes)) return current;
		void close(key);
		const timer = draining ? undefined : setTimeout(() => void close(key), COALESCE_WINDOW_MS);
		const fresh: Batch = { call, waiters: [], timer, blocks: 0, bytes: 0 };
		open.set(key, fresh);
		return fresh;
	};

	return {
		enqueue(row, call) {
			const write = bridgeWriteOf(row);
			if (!write || !call.bridgeUrl) return applyClaimed(call, row);
			const key = `${String(row.args.pageId)}\0${typeof write.body.afterBlockId === 'string' ? write.body.afterBlockId : 'end'}`;
			const blocks = write.body.blocks as unknown[];
			const bytes = bytesOf(blocks);
			return new Promise<Applied>((resolve, reject) => {
				const batch = batchFor(key, call, blocks.length, bytes);
				batch.waiters.push({ row, write, resolve, reject });
				batch.blocks += blocks.length;
				batch.bytes += bytes;
				if (draining) void close(key);
			});
		},
		async flush() {
			draining = true;
			await Promise.all([...open.keys()].map(close));
			await Promise.allSettled([...inFlight]);
		},
	};
}
