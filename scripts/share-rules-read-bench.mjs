/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   share-rules-read-bench.mjs                         :+:      :+:    :+:   */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * C606: time the two GET /api/perms/rules shapes against a live bridge.
 *
 *   BRIDGE_URL=https://bridge.example JWT=... WORKSPACE_ID=<uuid> PAGE_ID=<uuid> \
 *     node scripts/share-rules-read-bench.mjs
 *
 * 20 resourceId + inherited reads, then 20 list reads; prints p50/p95 in milliseconds.
 * The JWT comes from the environment and is never printed, echoed or put in an error.
 * A failed read fails the run: a 503 is not a fast answer.
 */

const BRIDGE_URL = (process.env.BRIDGE_URL ?? '').replace(/\/$/, '');
const JWT = process.env.JWT ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const PAGE_ID = process.env.PAGE_ID ?? '';
const ROUNDS = 20;

if (!BRIDGE_URL || !JWT || !WORKSPACE_ID || !PAGE_ID) {
	console.error('usage: BRIDGE_URL=... JWT=... WORKSPACE_ID=... PAGE_ID=... node scripts/share-rules-read-bench.mjs');
	process.exit(2);
}

const percentile = (samples, fraction) => {
	const sorted = [...samples].sort((left, right) => left - right);
	const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
	return sorted[index];
};

async function timed(path) {
	const started = performance.now();
	const response = await fetch(`${BRIDGE_URL}${path}`, {
		headers: { authorization: `Bearer ${JWT}`, accept: 'application/json' },
		signal: AbortSignal.timeout(30_000),
	});
	const text = await response.text();
	const elapsed = performance.now() - started;
	if (!response.ok) {
		console.error(`[share-rules-bench] ${path} answered ${response.status}: ${text.slice(0, 160)}`);
		process.exit(1);
	}
	return elapsed;
}

async function run(label, path) {
	const samples = [];
	for (let round = 0; round < ROUNDS; round += 1) samples.push(await timed(path));
	console.log(`${label}: p50 ${percentile(samples, 0.5).toFixed(1)} ms  p95 ${percentile(samples, 0.95).toFixed(1)} ms  (${ROUNDS} reads)`);
}

const workspace = encodeURIComponent(WORKSPACE_ID);
const page = encodeURIComponent(PAGE_ID);
await run('resourceId+inherited', `/api/perms/rules?workspaceId=${workspace}&resourceId=${page}&inherited=1`);
await run('list', `/api/perms/rules?workspaceId=${workspace}`);
