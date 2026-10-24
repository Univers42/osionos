/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-activity-maintenance.mjs                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The caller osionos_activity_maintain() never had: once at boot (after a 0-60 s jitter) and
 * every 6 hours it creates the coming partitions, then rebuilds yesterday's and the day
 * before's rollup (the second catches a late flush). Off unless OSIONOS_ACTIVITY=1: the flag
 * unset starts no timer and issues no query. Two bridges are safe: the database holds the lock.
 *
 * Caveat: a failure is logged by name and counted, never retried before the next tick, so a
 * persistent fault shows only in the log and in maintainFailures. A 'busy' rollup (another
 * replica holds the lock) is not a failure. The timer lives in one process: a bridge that
 * never stays up 6 hours still runs once per boot.
 */

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const MAX_JITTER_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const BENIGN_STATUS = new Set(['ok', 'busy']);

const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const firstRow = (result) => (Array.isArray(result) ? result[0] : result) ?? {};

export function startActivityMaintenance({ pg, env = process.env, log = console, clock = {} }) {
	const { setTimeout: later = setTimeout, clearTimeout: cancel = clearTimeout, now = Date.now, random = Math.random } = clock;
	const state = { defaultRows: 0, maintainFailures: 0 };
	if (env.OSIONOS_ACTIVITY !== '1') return { stop() {}, runOnce: async () => {}, stats: () => ({ ...state }) };

	let timer = null;
	let stopped = false;
	const fail = (what) => {
		state.maintainFailures += 1;
		log.warn(`[osionos-bridge] activity maintenance: ${what}`);
	};

	async function step(label, call) {
		try {
			return firstRow(await call());
		} catch (error) {
			fail(`${label} threw ${error?.code ?? error?.name ?? 'error'}`);
			return null;
		}
	}

	async function runOnce() {
		const service = pg.asService();
		const maintain = await step('maintain', () => service.rpc('osionos_activity_maintain', {}));
		if (maintain) {
			state.defaultRows = Number(maintain.default_rows) || 0;
			if (maintain.ok === false) fail('maintain returned ok=false');
			if (state.defaultRows > 0) log.warn(`[osionos-bridge] activity maintenance: ${state.defaultRows} rows in the DEFAULT partition`);
		}
		for (const daysBack of [1, 2]) {
			const forDay = utcDay(now() - daysBack * DAY_MS);
			const rollup = await step(`rollup ${forDay}`, () => service.rpc('osionos_activity_rollup', { for_day: forDay }));
			if (rollup && !BENIGN_STATUS.has(rollup.status)) fail(`rollup ${forDay} status ${rollup.status}`);
		}
	}

	function schedule(delayMs) {
		if (stopped) return;
		timer = later(async () => {
			await runOnce().catch(() => fail('run threw'));
			schedule(SIX_HOURS_MS);
		}, delayMs);
		timer?.unref?.();
	}

	schedule(Math.floor(random() * MAX_JITTER_MS));
	return {
		stop() {
			stopped = true;
			if (timer) cancel(timer);
		},
		runOnce,
		stats: () => ({ ...state }),
	};
}
