/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-activity.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Batched, bounded emitter for osionos_activity_events. emit() is synchronous and never throws:
 * it validates against the closed vocabulary, asks the consent gate, applies a per-user and a
 * queue cap (drop-new, so a flooding user cannot evict anyone's queued events), and queues. A
 * timer or a full batch flushes one POST at a time. Off unless OSIONOS_ACTIVITY=1 (then emit
 * counts nothing and issues no query); `isTracked` defaults to "nobody", so the flag alone records
 * nothing.
 *
 * Caveat: the queue is memory only. A crash or SIGKILL loses up to one flush interval plus one
 * batch, and a failed batch is dropped (counted as dropped.store), not re-queued: under a long
 * outage a retry buffer would fill the cap and drop anyway while competing with fresh events.
 * The per-user window is fixed, so a burst straddling a minute boundary can get up to twice the cap.
 */

import { isActivityEvent, isActivitySurface } from './bridge-activity-vocab.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BACKOFF_MS = 60_000;
const USER_WINDOW_MS = 60_000;
const TABLE = 'osionos_activity_events';

const intFrom = (value, fallback) => {
	const parsed = Number.parseInt(value, 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function createActivityEmitter({ pg, env = process.env, now = Date.now, isTracked = () => false }) {
	const enabled = env.OSIONOS_ACTIVITY === '1';
	const queueMax = intFrom(env.ACTIVITY_QUEUE_MAX, 5000);
	const userPerMin = intFrom(env.ACTIVITY_USER_PER_MIN, 50);
	const batchSize = intFrom(env.ACTIVITY_BATCH_SIZE, 200);
	const flushMs = intFrom(env.ACTIVITY_FLUSH_MS, 2000);

	const queue = [];
	const windows = new Map();
	const counters = { emitted: 0, dropped: { invalid: 0, overflow: 0, user_rate: 0, store: 0, untracked: 0 } };
	let inFlight = null;
	let inFlightSize = 0;
	let failures = 0;
	let backoffUntil = 0;
	let lastFlushOk = null;
	let timer = null;

	function overUserCap(userId) {
		const at = now();
		// Windows are pruned when the map grows past the queue cap, so a stream of distinct users stays bounded.
		if (windows.size > queueMax) for (const [id, w] of windows) if (at - w.start >= USER_WINDOW_MS) windows.delete(id);
		const window = windows.get(userId);
		if (!window || at - window.start >= USER_WINDOW_MS) {
			windows.set(userId, { start: at, count: 1 });
			return false;
		}
		window.count += 1;
		return window.count > userPerMin;
	}

	function accept(session, event, surface, workspaceId) {
		const userId = session?.userId;
		const validWorkspace = workspaceId == null || (typeof workspaceId === 'string' && UUID.test(workspaceId));
		if (typeof userId !== 'string' || !UUID.test(userId) || !isActivityEvent(event) || !isActivitySurface(surface) || !validWorkspace) {
			counters.dropped.invalid += 1;
			return;
		}
		if (!isTracked(session)) {
			counters.dropped.untracked += 1;
			return;
		}
		if (queue.length >= queueMax) {
			counters.dropped.overflow += 1;
			return;
		}
		if (overUserCap(userId)) {
			counters.dropped.user_rate += 1;
			return;
		}
		queue.push({ ts: new Date(now()).toISOString(), user_id: userId, workspace_id: workspaceId ?? null, event, surface });
		startTimer();
		if (queue.length >= batchSize) void flush();
	}

	function emit(session, event, surface, workspaceId) {
		if (!enabled) return;
		try {
			accept(session, event, surface, workspaceId);
		} catch {
			counters.dropped.invalid += 1;
		}
	}

	function startTimer() {
		if (timer) return;
		timer = setInterval(() => void flush(), flushMs);
		timer.unref?.();
	}

	async function send(batch) {
		try {
			await pg.asService().post(TABLE, batch, { prefer: 'return=minimal' });
			counters.emitted += batch.length;
			failures = 0;
			backoffUntil = 0;
			lastFlushOk = true;
		} catch {
			counters.dropped.store += batch.length;
			failures += 1;
			backoffUntil = now() + backoffMs();
			lastFlushOk = false;
		}
	}

	const backoffMs = () => (failures === 0 ? 0 : Math.min(flushMs * 2 ** failures, MAX_BACKOFF_MS));

	function flush({ force = false } = {}) {
		if (inFlight || queue.length === 0 || (!force && now() < backoffUntil)) return inFlight ?? Promise.resolve();
		const batch = queue.splice(0, batchSize);
		inFlightSize = batch.length;
		inFlight = send(batch).finally(() => {
			inFlight = null;
			inFlightSize = 0;
		});
		return inFlight;
	}

	async function close({ deadlineMs = 2000 } = {}) {
		if (timer) clearInterval(timer);
		timer = null;
		const pending = queue.length + inFlightSize;
		const before = counters.emitted;
		let expiry;
		let late = false;
		const timeout = new Promise((resolve) => {
			expiry = setTimeout(() => {
				late = true;
				resolve();
			}, deadlineMs);
		});
		while (!late && (queue.length > 0 || inFlight)) await Promise.race([flush({ force: true }), timeout]);
		clearTimeout(expiry);
		const flushed = counters.emitted - before;
		queue.length = 0;
		return { flushed, lost: Math.max(0, pending - flushed) };
	}

	const stats = () => ({
		queued: queue.length,
		emitted: counters.emitted,
		dropped: { ...counters.dropped },
		backoffMs: backoffMs(),
		lastFlushOk,
	});

	return { emit, stats, flush, close };
}
