/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-session-tracker.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The machinery every polled session table shares: the off | loading | fresh | stale state,
 * the freshness threshold, the one-line announce, the keyset-paged full reload, the local
 * writes that survive a reload already in flight, and the poller loop.
 *
 * The token verifier is synchronous and has ~50 callers, so a table is never read on the
 * request path: a poller replaces the whole set every 10 s and the request path reads only
 * memory. One implementation, two tables (the per-user cut-offs and the revoked session
 * ids), so the two can never drift apart on what "fresh" means.
 *
 * Caveat: a full reload costs about 112 B/row every 10 s (1k rows = 112 KB, measured
 * 2026-10-19 on PostgREST v12.2.3), so the cost grows with the table and not with traffic; a
 * warning fires past 5,000 rows. The reopen point is a delta poll on a DB-assigned
 * updated_at with a lookback window plus a periodic full reload (a cursor on the value
 * itself misses rows: now() is the transaction START, so a slow writer commits behind the
 * cursor). A revocation is enforced up to 10 s plus one query late on a bridge replica that
 * did not take the write, and up to 60 s during a poll outage. The row-count check
 * (Content-Range) can fail a healthy tick when a row is inserted between pages; that only
 * delays a load by one tick.
 */

import { BAAS_FETCH_TIMEOUT_MS } from './bridge-baas-body.mjs';
import { bumpAccess } from './bridge-access-generation.mjs';

export const POLL_INTERVAL_MS = 10_000;
export const STALE_AFTER_MS = 60_000;
export const RETRY_AFTER_SECONDS = 5;
export const PAGE_SIZE = 500;
export const LARGE_TABLE_ROWS = 5_000;

const TIMESTAMPTZ = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)$/;

function isoOffset(offset) {
	if (offset === 'Z') return 'Z';
	const digits = offset.slice(1).replace(':', '');
	return `${offset[0]}${digits.slice(0, 2)}:${digits.slice(2) || '00'}`;
}

/** A timestamptz as PostgREST renders it → integer microseconds since the epoch, or null. */
export function timestampMicros(text) {
	const match = typeof text === 'string' ? TIMESTAMPTZ.exec(text) : null;
	if (!match) return null;
	const [, date, time, fraction = '', offset] = match;
	const wholeMs = Date.parse(`${date}T${time}${isoOffset(offset)}`);
	if (!Number.isFinite(wholeMs)) return null;
	return wholeMs * 1000 + Number(fraction.padEnd(6, '0').slice(0, 6));
}

/**
 * One polled table. `merge` folds a local write into a loaded set (the cut-offs take the
 * later of two instants, the revoked ids are a set), so the shared loader never has to know
 * which table it is reading.
 */
export class PolledSessionSet {
	constructor({
		enforced,
		offReason = '',
		now = Date.now,
		log = console,
		label,
		table,
		hint,
		offEffect,
		caveat,
		merge,
		largeTableRows = LARGE_TABLE_ROWS,
	} = {}) {
		this.enforced = enforced;
		this.offReason = offReason;
		this.now = now;
		this.log = log;
		this.label = label;
		this.table = table;
		this.hint = hint;
		this.offEffect = offEffect;
		this.caveat = caveat;
		this.merge = merge;
		this.largeTableRows = largeTableRows;
		this.entries = null;
		this.loadedAt = null;
		this.observedState = enforced ? 'loading' : 'off';
		this.failureStreak = null;
		this.warnedLarge = false;
		this.writeSequence = 0;
		this.localWrites = new Map();
	}

	/** One of off | loading | fresh | stale; a change is logged once, whoever observes it first. */
	status() {
		const state = this.#state();
		if (state !== this.observedState) {
			this.#announce(state);
			this.observedState = state;
		}
		return state;
	}

	ageMs() {
		return this.loadedAt === null ? null : this.now() - this.loadedAt;
	}

	/** A write this process just made applies at once and survives a swap from a poll that began earlier. */
	applyLocal(key, value) {
		// Global: a cutoff or revoke names a session, and a cached allow is keyed by user, so it
		// cannot say which entries that session fed.
		bumpAccess();
		this.writeSequence += 1;
		this.localWrites.set(key, { value, sequence: this.writeSequence });
		if (this.entries) this.merge(this.entries, key, value);
	}

	/** Mark the start of a poll; hand the result to completeLoad. */
	beginLoad() {
		return this.writeSequence;
	}

	completeLoad(loaded, startSequence) {
		for (const [key, write] of this.localWrites) {
			if (write.sequence > startSequence) this.merge(loaded, key, write.value);
		}
		this.localWrites.clear();
		this.entries = loaded;
		this.loadedAt = this.now();
		this.failureStreak = null;
		if (this.largeTableRows > 0 && loaded.size > this.largeTableRows && !this.warnedLarge) {
			this.warnedLarge = true;
			this.log.warn(`[osionos-bridge] ${this.label}: ${loaded.size} rows; a full reload every ${POLL_INTERVAL_MS / 1000} s now moves more than 500 KB (${this.caveat}).`);
		}
		this.status();
	}

	failLoad(error) {
		// The message may carry upstream text: control characters (a forged log line) go.
		const message = (error instanceof Error ? error.message : String(error)).replace(/[\x00-\x1f\x7f]+/g, ' ');
		if (this.failureStreak !== message) this.log.warn(`[osionos-bridge] ${this.label}: load failed (${message}); ${this.hint}.`);
		this.failureStreak = message;
		this.status();
	}

	bootLine() {
		return this.enforced
			? `[osionos-bridge] ${this.label}: enforcing; every token request answers 503 until the first load of ${this.table}.`
			: `[osionos-bridge] ${this.label}: OFF (${this.offReason}); ${this.offEffect}`;
	}

	#state() {
		if (!this.enforced) return 'off';
		if (this.loadedAt === null) return 'loading';
		return this.now() - this.loadedAt > STALE_AFTER_MS ? 'stale' : 'fresh';
	}

	#announce(state) {
		if (state === 'fresh') this.log.info(`[osionos-bridge] ${this.label}: fresh, serving tokens.`);
		else this.log.warn(`[osionos-bridge] ${this.label}: ${state}; every token request answers 503 until a load succeeds. ${this.hint}.`);
	}
}

function contentRangeTotal(header) {
	const total = /\/(\d+)$/.exec(header ?? '')?.[1];
	if (total === undefined) throw new Error(`Content-Range carried no total (${header ?? 'header missing'})`);
	return Number(total);
}

function withDeadline(run, timeoutMs) {
	const controller = new AbortController();
	let timer;
	const deadline = new Promise((_, reject) => {
		timer = setTimeout(() => { controller.abort(); reject(new Error(`timed out after ${timeoutMs} ms`)); }, timeoutMs);
	});
	return Promise.race([run(controller.signal), deadline]).finally(() => clearTimeout(timer));
}

async function readPage({ fetchImpl, baasUrl, serviceKey }, { table, select, orderColumn, filters, cursor, pageSize }, signal) {
	const params = new URLSearchParams({ select, order: `${orderColumn}.asc`, limit: String(pageSize) });
	for (const [key, value] of Object.entries(filters ?? {})) params.set(key, value);
	if (cursor !== null) params.set(orderColumn, `gt.${cursor}`);
	const headers = { Accept: 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
	if (cursor === null) headers.Prefer = 'count=exact';
	const response = await fetchImpl(`${baasUrl}/rest/v1/${table}?${params}`, { headers, signal });
	if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text().catch(() => '')).slice(0, 160)}`);
	const rows = JSON.parse(await response.text());
	if (!Array.isArray(rows)) throw new Error('the answer was not a row list');
	return { rows, contentRange: response.headers.get('content-range') };
}

/**
 * The whole table by keyset pages on one column; throws unless every row the first page
 * counted arrived. The cursor is the row's own value, lower-cased: both tables are keyed by
 * a uuid, and a uuid never depends on the case.
 */
// The deadline defaults here, not per poller: the revocation poller passed none in production
// (bridge-api.mjs starts it without options), setTimeout(…, undefined) fired at once, every load
// "timed out after undefined ms" and every token answered 503 (public release, 2026-10-23).
export async function readPagedRows(source, { table, select, orderColumn, filters = {}, pageSize = PAGE_SIZE, timeoutMs = BAAS_FETCH_TIMEOUT_MS }) {
	const rows = [];
	let received = 0;
	let total = null;
	let cursor = null;
	for (;;) {
		const page = await withDeadline((signal) => readPage(source, { table, select, orderColumn, filters, cursor, pageSize }, signal), timeoutMs);
		if (cursor === null) total = contentRangeTotal(page.contentRange);
		rows.push(...page.rows);
		received += page.rows.length;
		if (page.rows.length < pageSize) break;
		const last = String(page.rows.at(-1)?.[orderColumn] ?? '').toLowerCase();
		if (!last) throw new Error(`a row had no ${orderColumn} to page on`);
		if (cursor !== null && last <= cursor) throw new Error('the keyset cursor did not advance');
		cursor = last;
	}
	if (received !== total) throw new Error(`received ${received} rows but Content-Range counted ${total} (truncated by max-rows, or rows changed between pages)`);
	return rows;
}

/**
 * Polls with a setTimeout chain (a tick never overlaps the next) and unref'd timers. A tick
 * never rejects: every failure becomes failLoad. `stop()` ends the chain.
 */
export function startPolledSessionPoller(tracker, load, { intervalMs = POLL_INTERVAL_MS } = {}) {
	let timer = null;
	let stopped = false;
	async function tick() {
		const startSequence = tracker.beginLoad();
		try {
			tracker.completeLoad(await load(), startSequence);
		} catch (error) {
			tracker.failLoad(error);
		}
	}
	async function run() {
		await tick();
		if (stopped) return;
		timer = setTimeout(run, intervalMs);
		timer.unref();
	}
	if (tracker.enforced) void run();
	return { tick, stop() { stopped = true; clearTimeout(timer); } };
}
