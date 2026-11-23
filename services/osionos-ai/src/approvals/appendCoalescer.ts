import type { ApprovalRow } from './types.ts';
import { bridgeWriteOf, applyClaimed } from './apply.ts';
import type { Applied, ApplyCall } from './apply.ts';
import { applyAppendMany } from './applyAppend.ts';
import type { AppendEntry } from './applyAppend.ts';

/**
 * Appends to one page and one anchor, auto-applied in the same step, leave as
 * one bridge call: the bridge's client edit round trip (a PATCH) is overtaken
 * by more than 4 appends to a page, which sends the user's edit to a copy page.
 *
 * Caveat: appends merge only inside this window and inside one run, not across
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
	timer: ReturnType<typeof setTimeout>;
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

export function makeAppendCoalescer(): AppendCoalescer {
	const open = new Map<string, Batch>();
	const inFlight = new Set<Promise<void>>();

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

	return {
		enqueue(row, call) {
			const write = bridgeWriteOf(row);
			if (!write || !call.bridgeUrl) return applyClaimed(call, row);
			const key = `${String(row.args.pageId)}\0${typeof write.body.afterBlockId === 'string' ? write.body.afterBlockId : 'end'}`;
			return new Promise<Applied>((resolve, reject) => {
				let batch = open.get(key);
				if (!batch) {
					batch = { call, waiters: [], timer: setTimeout(() => void close(key), COALESCE_WINDOW_MS) };
					open.set(key, batch);
				}
				batch.waiters.push({ row, write, resolve, reject });
			});
		},
		async flush() {
			await Promise.all([...open.keys()].map(close));
			await Promise.allSettled([...inFlight]);
		},
	};
}
